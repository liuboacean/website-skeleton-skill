/**
 * Platform Middleware — 所有请求的第一道防线
 *
 * 职责：
 *   ① CORS 预检（OPTIONS）
 *   ② CSP Header 注入（仅 HTML）
 *   ③ 轻量 Bearer 检查（公开路径放行）
 *   ④ 支付回调独立路径 → 直接 return，不进 Edge Middleware
 *
 * EdgeOne Pages 自动识别此文件并作为 Platform Middleware 运行。
 */

export function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // === ① CORS 预检 ===
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-ID',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // === ② CSP & 安全 Header 注入（仅返回 HTML 时）===
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) {
    const response = next();
    const CSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.edgeone.dev https://api.weixin.qq.com https://openapi.alipay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Content-Security-Policy', CSP);
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  // === ③ 轻量 Bearer 检查（放行公开 API）===
  const publicApiPrefixes = ['/api/products', '/api/categories'];
  if (publicApiPrefixes.some(p => pathname.startsWith(p))) {
    return next();
  }

  // === ④ 支付回调独立路径 ===
  // 微信/支付宝回调没有 JWT Cookie，必须在此处放行
  if (pathname === '/api/pay/wx-notify' || pathname === '/api/pay/ali-notify') {
    // 直接传递到 Cloud Function，不做任何认证检查
    return next();
  }

  // === Auth 路径放行 ===
  if (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/register') ||
    pathname === '/api/auth/refresh'
  ) {
    return next();
  }

  // === 其他路径：继续到 Edge Middleware / Cloud Function ===
  return next();
}
