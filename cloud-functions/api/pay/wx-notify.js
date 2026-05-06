/**
 * 微信支付回调处理 — KV 幂等锁反查 tenant（P0-2）
 *
 * Phase 4A W4 实现（P0-2 修复）：
 * - Cloud Functions 版本（可同时访问 KV + MySQL）
 * - 回调时先从 KV 反查 tenant（避免 {tenant} 鸡生蛋）
 * - 拿到 tenant 后走 withTransaction 更新订单
 *
 * POST /api/pay/wx-notify
 * Body: XML (微信回调格式) 或 JSON
 */

import { queryOne, withTransaction } from '../../utils/db.js';

export async function onRequest(request, env) {
  const body = await request.text();

  // 解析回调数据（简化版：假设 JSON，生产环境需解析微信 XML）
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    data = parseWechatXML(body);
  }

  const orderId = data?.out_trade_no;
  if (!orderId) {
    return new Response('Missing out_trade_no', { status: 400 });
  }

  // Step 1: 从 KV 反查 tenant（P0-2 修复，零 SQL 绕过）
  const meta = JSON.parse(
    (await env.KV.get(`order_tenant:${orderId}`)) || '{}'
  );
  const tenant = meta?.tenant;
  if (!tenant) {
    console.warn(`[WechatNotify] Order ${orderId} not found in KV`);
    return new Response('Order not found', { status: 404 });
  }

  // Step 2: 用 tenant 走正常 query() 流程
  const order = queryOne(env,
    'SELECT * FROM orders WHERE tenant_id = {tenant} AND order_id = ?',
    [orderId], tenant
  );

  if (!order) {
    console.warn(`[WechatNotify] Order ${orderId} not found in DB for tenant ${tenant}`);
    return new Response('Order not found', { status: 404 });
  }

  // Step 3: 更新订单状态 + 审计日志
  withTransaction(env, tenant, (ctx) => {
    ctx.execute(
      "UPDATE orders SET status = ?, paid_at = NOW() WHERE order_id = {tenant} AND order_id = ? AND status = ?",
      ['PAID', orderId, 'PENDING']
    );

    ctx.execute(
      `INSERT INTO order_status_logs (order_id, from_status, to_status, operator, reason, tenant_id)
       VALUES ({tenant}, ?, ?, ?, ?, ?)`,
      [orderId, 'PENDING', 'PAID', 'system:wx-notify', '微信支付回调', tenant]
    );
  });

  // Step 4: 清除幂等锁
  await env.KV.delete(`order_tenant:${orderId}`);

  console.log(`[WechatNotify] Order ${orderId} paid (tenant: ${tenant})`);

  return new Response('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>', {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

function parseWechatXML(xml) {
  const match = xml.match(/<out_trade_no><!\[CDATA\[(.+?)\]\]><\/out_trade_no>/);
  return match ? { out_trade_no: match[1] } : {};
}
