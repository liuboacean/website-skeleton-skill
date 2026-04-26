# 建站 Skill — EdgeOne Pages 全栈网站骨架

> **版本：** 2.1 · **日期：** 2026-04-26
> **一句话描述：** 用户说一句话，AI 生成完整前后端网站，自动部署到 EdgeOne Pages。

---

## 一、核心设计理念

```
一次设计，无限复用 = 5 个模块 × 3 个场景 × 1 个部署平台
```

将"建站"拆解为 **Layer 0 基础设施** + **Layer 1 能力栈** + **Layer 2 可选增强**：

| 层级 | 内容 | 性质 |
|------|------|------|
| **Layer 0**（Core） | SPA 骨架 + Auth + Middleware + EventBus | 必选，不可裁剪 |
| **Layer 1**（Stack） | 🛒 电商栈 · 🤖 AI 栈 · 📊 管理栈 | 按需组合，互不依赖 |
| **Layer 2**（Addon） | SEO · Analytics · i18n | 可选增强 |

**场景模板优先**：用户选"电商"、"AI 助手"或"管理后台"场景，不选模块——模块由模板自动组合。

---

## 二、技术架构

### 2.1 EdgeOne Pages 双运行时

```
┌──────────────────────────────────────────────────────────────┐
│  Platform Middleware（middleware.js）                        │
│  ① CORS 预检（OPTIONS）                                     │
│  ② CSP Header 注入                                          │
│  ③ 轻量 Bearer 检查（公开路径放行）                           │
│  ④ 支付回调 IP 白名单 → 直接 return，不进 Edge Middleware     │
└──────────────────────────────────────────────────────────────┘
                              ↓（非回调路径）
┌──────────────────────────────────────────────────────────────┐
│  Edge Functions Middleware（V8 + KV）                      │
│  ⑤ JWT 详细校验（crypto.subtle）                             │
│  ⑥ KV session 验证                                          │
│  ⑦ KV 限流计数器（滑动窗口）                                   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 运行时职责边界

| 运行时 | 存储 | 职责 | 说明 |
|--------|------|------|------|
| **Edge Functions**（V8） | KV | Auth 登录/me、Products 公开读、Cart、Orders 读、AI History 读、幂等锁 | 延迟敏感、无密钥 |
| **Cloud Functions**（Node） | MySQL | Auth 注册/bcrypt、Payment 创建/回调、Admin CRUD、Orders 创建/取消、AI SSE 流 | 密钥操作、复杂事务 |

> ⚠️ **平台约束（EdgeOne Pages）：**
> - KV 仅 Edge Functions 可用，Cloud Functions 无法访问
> - Cloud Functions 目录名必须为 `cloud-functions/`
> - bcrypt 必须在 Cloud Functions 中执行

### 2.3 分层目录结构

```
website-skeleton/
├── SKILL.md                    # 本文件，Skill 核心指令
│
├── templates/                  # 场景预设模板
│   ├── e-commerce.json         # 🛒 电商场景
│   ├── ai-assistant.json       # 🤖 AI 助手场景
│   └── saas-admin.json         # 📊 SaaS 管理后台场景
│
├── sharing/                    # 跨运行时共享（构建时同步）
│   ├── types.ts               # User/Product/Cart/Order/AISession 接口
│   ├── constants.ts           # OrderStatus/UserRole/APIPaths 枚举
│   ├── validators.ts           # 共享输入校验
│   └── kv-keys.ts             # KV key 命名（含租户前缀占位）
│
├── client/                     # 前端 SPA
│   ├── index.html
│   └── src/
│       ├── app.js             # 启动 + History API 路由
│       ├── utils/
│       │   ├── event-bus.js   # 全局事件总线（P0）
│       │   ├── router.js      # History API 路由 + AuthGuard
│       │   ├── escape-html.js # XSS 防护
│       │   └── storage.js      # localStorage 封装
│       ├── services/
│       │   ├── api.js          # 统一客户端 + 拦截器
│       │   ├── auth.js         # 内存 AuthService
│       │   ├── cart.js         # 双模式购物车
│       │   └── ai.js           # SSE 流式 AI
│       └── components/         # 组件清单
│
├── middleware.js               # Platform Middleware
│
├── db/                         # 数据库迁移
│   ├── migrations/
│   │   └── 001_init.sql        # 建表脚本
│   └── seed.sql                # 测试数据
│
├── docs/
│   └── env-vars.md             # 环境变量矩阵
│
├── edge-functions/             # Edge Functions（V8 + KV）
│   ├── _middleware.js          # JWT 校验 + KV session + 限流
│   ├── api/
│   │   ├── auth/login.js       # JWT 签发（Cookie） + KV session
│   │   ├── auth/me.js          # KV session 读取
│   │   ├── auth/refresh.js     # RT 轮换（KV version 乐观锁）
│   │   ├── auth/logout.js      # 清除 Cookie + KV session
│   │   ├── internal/idempotency.js  # Edge 原子幂等锁
│   │   ├── products/list.js   # KV 缓存 + Cloud MySQL 回源
│   │   ├── products/[id].js
│   │   ├── products/categories.js
│   │   ├── cart/*.js           # KV 购物车
│   │   ├── orders/list.js      # MySQL 订单读取
│   │   ├── orders/[id].js
│   │   └── ai/history.js       # KV 读取 AI 会话历史
│   └── utils/
│       ├── kv-helper.js
│       ├── jwt-helper.js       # crypto.subtle HS256
│       ├── rate-limit.js        # KV 滑动窗口限流
│       └── response.js
│
├── cloud-functions/            # Cloud Functions（Node.js）
│   ├── api/
│   │   ├── auth/register.js   # bcrypt cost=12 + MySQL
│   │   ├── pay/create-order.js # 微信/支付宝预下单
│   │   ├── pay/wx-notify.js   # Edge 幂等锁 → 业务处理
│   │   ├── pay/ali-notify.js
│   │   ├── pay/query.js
│   │   ├── pay/close.js
│   │   ├── admin/products.js   # MySQL CRUD（含 version 乐观锁）
│   │   ├── admin/orders.js    # MySQL 查询
│   │   ├── admin/users.js     # MySQL CRUD
│   │   ├── admin/stats.js     # MySQL 聚合统计
│   │   ├── order/create.js    # SELECT FOR UPDATE + 事务 + 指数退避
│   │   ├── order/detail.js
│   │   ├── order/cancel.js    # 状态机 + version 校验
│   │   └── ai/chat-stream.js  # SSE 流式（主力实现）
│   └── utils/
│       ├── db.js               # MySQL 连接池（mysql2/promise）
│       ├── payment-sdk.js      # 微信V3/支付宝 SDK 封装
│       ├── admin-guard.js
│       └── notification-hooks.js  # 通知钩子空壳
│
├── references/                  # 能力参考文档
│   ├── auth-module.md
│   ├── cart-module.md
│   ├── payment-module.md
│   ├── ai-chat-module.md
│   ├── admin-module.md
│   ├── notification-module.md
│   ├── edge-functions.md
│   ├── cloud-functions.md
│   ├── kv-storage.md
│   ├── middleware.md
│   └── deployment.md
│
└── scripts/
    ├── init-site.js             # 交互式初始化（模板优先）
    ├── sync-sharing.js          # 构建时 shared → edge/cloud 同步
    └── sample-data.js
```

---

## 三、Auth 模块（Layer 0，Core）

### API 路由

| 方法 | 路径 | 运行时 | 说明 |
|------|------|--------|------|
| POST | `/api/auth/login` | Edge（KV） | JWT 签发 + KV session |
| GET | `/api/auth/me` | Edge（KV） | KV session 读取 |
| POST | `/api/auth/refresh` | Edge（KV） | RT 轮换（version 乐观锁） |
| POST | `/api/auth/logout` | Edge（KV） | 清除 Cookie + KV session |
| POST | `/api/auth/register` | Cloud（MySQL） | bcrypt cost=12 + MySQL |

### JWT 安全设计

```
Access Token：短期 JWT（15min）+ HttpOnly Cookie（Secure + SameSite=Strict）
Refresh Token：7天 TTL，存 KV rt:{userId}:meta（含 version）
算法：Phase 1 用 HS256 + 短期 TTL，Phase 2 迁移 RS256
```

### 【v2.1 Critical 修复】RT 并发安全

两个请求并发携带同一 RT，只有第一个能成功写入新 version，第二个收到 409 → 客户端稍等重试。

```javascript
// edge-functions/api/auth/refresh.js
export async function onRequest(context) {
  const { RT } = await getTokens(context.request);
  const { KV } = context.env;
  const payload = parseJWT(RT);
  const userId = payload.sub;
  if (!userId) return new Response('Invalid', { status: 401 });

  const current = await KV.get(`rt:${userId}:meta`);
  const { version: oldVersion, token: oldToken } = JSON.parse(current || '{"version":0,"token":""}');

  if (oldToken !== RT) {
    return new Response('Token already rotated', { status: 409 });
  }

  const newVersion = oldVersion + 1;
  const newToken = signRT(userId, newVersion);

  const ok = await KV.put(
    `rt:${userId}:meta`,
    JSON.stringify({ version: newVersion, token: newToken }),
    { expirationTtl: 604800 }
  );

  if (!ok) return new Response('Concurrent rotation', { status: 409 });

  return new Response(JSON.stringify({ refreshToken: newToken }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## 四、Cart 模块（Layer 1，电商栈）

**双模式同步：**
```
未登录：localStorage（30d TTL 自动清理）
登录时：localStorage → 服务端 KV（syncOnLogin()）
已登录：服务端 KV（唯一数据源）
```

---

## 五、Payment 模块（Layer 1，电商栈）

### 独立回调路径

```
/api/pay/wx-notify   ← 微信支付回调（IP 白名单后直接 return，不进 Edge Middleware）
/api/pay/ali-notify  ← 支付宝回调（独立路径）
```

### 【v2.1 Critical 修复】支付幂等原子锁

微信支付平台会在回调超时后重试（最长 72h），KV 查→判→写三步非原子。解决方案：Edge Function `putIfNotExists` 原子幂等锁。

```javascript
// ===== Edge Function（唯一可访问 KV 的路径）=====
// edge-functions/api/internal/idempotency.js
export async function onRequest(context) {
  const { KV } = context.env;
  const { out_trade_no, callback_id } = await context.request.json();

  const acquired = await KV.putIfNotExists(
    `pay:idempotency:${out_trade_no}`,
    callback_id,
    { expirationTtl: 86400 }   // 24h < 微信重试窗口 72h
  );

  return new Response(JSON.stringify({ acquired }), { status: 200 });
}

// ===== Cloud Function（微信回调处理）=====
// cloud-functions/api/pay/wx-notify.js
export async function onRequest(request, env) {
  const rawBody = await request.text();
  if (!await verifyWechatSignature(rawBody, env.WX_MCH_SECRET))
    return new Response('FAIL', { status: 401 });

  const { out_trade_no, transaction_id, trade_state } = JSON.parse(rawBody);

  const { acquired } = await fetch(`${env.EDGE_BASE}/api/internal/idempotency`, {
    method: 'POST',
    body: JSON.stringify({ out_trade_no, callback_id: transaction_id })
  }).then(r => r.json());

  if (!acquired) return new Response('SUCCESS');  // 幂等跳过，但返回 SUCCESS 止重试

  if (trade_state === 'SUCCESS') await processPayment(out_trade_no, transaction_id, env);
  return new Response('SUCCESS');
}
```

---

## 六、Order 创建原子性（v2.1 Critical 修复）

高并发下，`UPDATE ... WHERE stock >= ?` 可能同时通过检查导致超卖。解决方案：`SELECT FOR UPDATE` + 乐观锁 + MySQL CHECK 约束。

```javascript
// cloud-functions/api/order/create.js
export async function onRequest(request, env) {
  const { userId } = await auth(request, env);
  const { productId, quantity } = await request.json();
  const pool = await getPool(env.DATABASE_URL);

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      await pool.beginTransaction();

      // ① SELECT FOR UPDATE：锁定商品行（持有行锁期间其他事务阻塞）
      const [rows] = await pool.query(
        'SELECT id, stock, price, version FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      if (!rows.length) { await pool.rollback(); return 404; }
      const product = rows[0];

      // ② 持有行锁期间校验库存（无竞态）
      if (product.stock < quantity) {
        await pool.rollback();
        return { error: '库存不足', available: product.stock };
      }

      // ③ 乐观锁更新（双重保障）
      const [updateResult] = await pool.query(
        'UPDATE products SET stock = stock - ?, version = version + 1 WHERE id = ? AND version = ?',
        [quantity, productId, product.version]
      );
      if (updateResult.affectedRows === 0) {
        await pool.rollback();
        return { error: '并发冲突，请重试' };
      }

      // ④ 创建订单（同一事务内）
      const orderNo = generateOrderNo();
      await pool.query(
        `INSERT INTO orders (order_no, out_trade_no, user_id, product_id, qty, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
        [orderNo, `WX_${orderNo}`, userId, productId, quantity, product.price * quantity]
      );

      await pool.commit();

      // ⑤ 事务成功后，异步调用微信统一下单（不在事务内）
      const payment = await createPayment(orderNo, product.price * quantity, env);
      return { orderNo, payment };

    } catch (err) {
      await pool.rollback();
      if (isRetryable(err) && attempt < 3) {
        await sleep(100 * Math.pow(2, attempt - 1));  // 指数退避
        continue;
      }
      return { error: '创建失败，请重试' };
    }
  }
}

function isRetryable(err) {
  return err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT';
}
```

---

## 七、KV 分层查询策略

EdgeOne Pages KV **不支持复合查询**，按以下策略分层：

| 场景 | KV 层（Edge） | MySQL 层（Cloud） |
|------|-------------|-----------------|
| 单商品读取 | ✅ KV 缓存 | — |
| 商品列表（无筛选） | ✅ 缓存第1页 | — |
| 分类+价格区间筛选 | — | ✅ Cloud MySQL |
| 搜索关键词 | — | ✅ Cloud MySQL FULLTEXT |
| AI 会话历史（单用户） | ✅ KV | — |
| 订单统计（多条件聚合） | — | ✅ Cloud MySQL |

---

## 八、AI Chat 模块（Layer 1，AI 栈）

**Cloud Functions SSE 实现（Edge 无法使用 waitUntil）：**

```
前端 → GET /api/ai/history（Edge，KV 读取）→ 拿到历史上下文
    → SSE 连接 /api/ai/chat-stream（Cloud）→ 带历史 context
    → Cloud 流式响应 + 异步写 KV 保存历史
```

---

## 九、Admin 模块（Layer 1，管理栈）

**RBAC 权限体系：**
```
role: user   → 购物车、下单、查看自己的订单
role: admin  → 商品 CRUD、订单管理、用户管理、运营统计
```

---

## 十、数据库 Schema

```sql
-- db/migrations/001_init.sql

CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('user','admin') DEFAULT 'user',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  price       DECIMAL(10,2) NOT NULL,    -- 服务端唯一价格来源
  stock       INT UNSIGNED NOT NULL DEFAULT 0,
  category_id INT UNSIGNED,
  status      ENUM('active','inactive') DEFAULT 'active',
  version     INT UNSIGNED DEFAULT 1,    -- 乐观锁版本号
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_stock_positive CHECK (stock >= 0)
);

CREATE TABLE orders (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no      VARCHAR(64) UNIQUE NOT NULL,
  out_trade_no  VARCHAR(128) UNIQUE,
  user_id       BIGINT UNSIGNED NOT NULL,
  total         DECIMAL(10,2) NOT NULL,
  status        ENUM('pending','paid','shipped','cancelled','refunded') DEFAULT 'pending',
  paid_at       DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  qty         INT UNSIGNED NOT NULL,
  price       DECIMAL(10,2) NOT NULL,   -- 快照价格
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE admin_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(64) NOT NULL,
  target      VARCHAR(128),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
```

---

## 十一、环境变量矩阵

| 环境变量 | 必填 | 用于 | 运行时 |
|---------|------|------|--------|
| `JWT_SECRET` | ✅ | JWT 签名（HS256） | Edge + Cloud |
| `AI_API_KEY` | ✅（AI栈） | AI 模型调用 | Cloud |
| `WX_APPID` | ✅（电商栈） | 微信支付 AppID | Cloud |
| `WX_MCHID` | ✅（电商栈） | 微信支付商户号 | Cloud |
| `WX_API_KEY` | ✅（电商栈） | 微信支付 APIv3 密钥 | Cloud |
| `WX_CERT_PATH` | ✅（电商栈） | 微信支付证书路径 | Cloud |
| `ALI_APP_ID` | ✅（电商栈） | 支付宝 AppID | Cloud |
| `ALI_PRIVATE_KEY` | ✅（电商栈） | 支付宝私钥 | Cloud |
| `DATABASE_URL` | ✅（电商+管理） | MySQL 连接字符串 | Cloud |
| `EDGE_BASE` | ✅（电商栈） | Edge Function 内部网关地址 | Cloud |

---

## 十二、初始化工作流

```
Step 1: 选择建站类型
  [1] 🛒 快速电商站（推荐）
  [2] 🤖 AI 客服站
  [3] 📊 SaaS 管理后台
  [4] ⚙️ 自定义模块组合

Step 2: 确认预填 / 模块选择

Step 3: 填写基本信息（站点名、域名）

Step 4: 密钥配置（从 env-vars.md 模板读取，EdgeOne Pages 环境变量注入）

Step 5: 执行 db/migrations/001_init.sql（自动或手动）

Step 6: 生成代码 → edgeone deploy → 返回访问 URL
```

---

## 十三、安全检查清单

### 🔴 P0（上线前必须完成）

- [x] 支付幂等：Edge 原子 `putIfNotExists` 锁
- [x] 订单超卖：`SELECT FOR UPDATE` + MySQL 事务 + CHECK 约束
- [x] RT 并发安全：KV version 乐观锁（409 重试）
- [x] KV 复合查询：分层策略（KV 缓存 / MySQL 复杂查询）
- [x] 支付回调路径 Platform Middleware 直接 return
- [x] 金额服务端 MySQL 计算，前端永不传 price
- [x] bcrypt cost ≥ 12（Cloud Functions 中）

### 🟡 P1（正式版前完成）

- [ ] JWT 短期 Access Token（15min）+ RT 轮换
- [ ] Cookie：HttpOnly + Secure + SameSite=Strict
- [ ] AI 聊天限流（KV 计数：未登录 10次/分钟，登录 60次/分钟）
- [ ] CSP Header（Platform Middleware 注入）
- [ ] EventBus 401 自动跳转登录
- [ ] Notification 钩子空壳（Phase 2 实现）

### 🟢 P2（可选）

- [ ] RS256 迁移
- [ ] 订单状态机（Pending→Paid→Shipped→Completed，version 校验）

---

## 十四、演示站点

**已部署：** https://geek-mall-demo-4qaxvmeh.edgeone.cool

**功能验证清单：**
- [ ] 首页商品浏览（12 个商品）
- [ ] 用户注册（bcrypt cost=12）
- [ ] 用户登录（JWT 15min + RT 7d）
- [ ] 购物车（localStorage 持久化）
- [ ] 结账（微信/支付宝选择）
- [ ] 模拟支付成功回调
- [ ] 我的订单（状态标签）
