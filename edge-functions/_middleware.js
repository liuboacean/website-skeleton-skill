/**
 * Edge Functions Middleware — JWT 详细校验 + KV session 验证 + 限流
 *
 * 运行在 V8 运行时中，仅处理 Edge Function 路径的请求。
 * 支付回调等路径已被 Platform Middleware 放行，不会到达这里。
 *
 * 职责：
 *   ⑤ JWT 详细校验（crypto.subtle）
 *   ⑥ KV session 验证
 *   ⑦ KV 限流计数器（滑动窗口）
 */

import { verifyAccessToken, extractToken } from './sharing/jwt-helper.js';
import { checkRateLimit } from './utils/rate-limit.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // === 公开路径放行（无需 JWT）===
  const publicPaths = ['/api/products', '/api/categories'];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return context.next();
  }

  // === Auth 路径放行 ===
  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/register')
  ) {
    return context.next();
  }

  // === RT 刷新路径放行（使用 Cookie 中的 RT）===
  if (pathname === '/api/auth/refresh') {
    return context.next();
  }

  // === 支付回调路径安全放行（双重保险）===
  if (pathname === '/api/pay/wx-notify' || pathname === '/api/pay/ali-notify') {
    return context.next();
  }

  // === 提取 + 验证 JWT ===
  const tokenData = extractToken(request);
  if (!tokenData) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await verifyAccessToken(tokenData.token, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Token expired or invalid' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // === KV session 验证（登录态是否仍有效）===
  if (payload.sub) {
    try {
      const sessionKey = `session:${payload.sub}`;
      const sessionData = await env.KV?.get?.(sessionKey);
      if (!sessionData && payload.type === 'access') {
        // Session 已过期或不存在 → 强制重新登录
        return new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      // KV 不可用时降级处理（不阻塞请求）
      console.warn(`[Middleware] KV session check failed: ${err.message}`);
    }
  }

  // === 限流（AI 栈专用）===
  if (pathname.startsWith('/api/ai/')) {
    const clientId = payload.sub || request.headers.get('CF-Connecting-IP');
    const limit = payload.role === 'admin' ? 200 : 60;
    const { allowed, resetMs } = await checkRateLimit(context, `ai:${clientId}`, limit);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limited' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(resetMs / 1000)),
        },
      });
    }
  }

  // === 注入用户信息到 request（下游 Edge Function 可读取）===
  const newHeaders = new Headers(request.headers);
  newHeaders.set('X-User-Id', String(payload.sub));
  newHeaders.set('X-User-Role', payload.role || 'user');

  const newRequest = new Request(request, { headers: newHeaders });

  return context.next(newRequest);
}
