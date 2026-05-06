# Changelog

> 语义化版本（SemVer）：<https://semver.org/>
> 所有包在 Phase 4 期间 lockstep 发布补丁版本

## 3.0.0 (2026-05-06)

### 🎉 Phase 4A — 多租户隔离

#### 重大变更
- **JWT 扩展**：新 token 包含 `tenant`/`role`/`jti` 字段，旧 token 自动从 `users` 表反查
- **数据库迁移**：6 张核心表增加 `tenant_id` 列 + 复合索引
- **所有 SQL 必须包含 `{tenant}` 占位符**：通过 `db.js` 接口强制执行
- **权限分层**：从单一 `admin` 拆分为 `superadmin`/`tenant_admin`/`user`

#### 新增
- 多租户中间件（Cloud: `tenant-context.js`, Edge: `rbac.js`）
- 数据库事务支持（`db.js` → `withTransaction()`）
- 共享配额模块（`quota.js` → 软/硬限制 + fail-open）
- 审计日志（`audit.js` → 90 天 KV 保留）
- 租户管理 API（CRUD + 邀请 + 启用/停用）
- 14 条集成测试（功能 6 + 安全 8）

#### 修复
- 移除 `@edge-runtime/primitives` 导入（EdgeOne V8 不兼容）
- 支付回调改为 KV 反查（修复 `{tenant}` 鸡生蛋问题）

#### 依赖
- `@website-skeleton/shared` → 3.0.0
- `@website-skeleton/payment` → 1.0.0
- `@website-skeleton/admin` → 1.0.0

## 2.2.0 (2026-04-26)

### Phase 3 — 工程化完善
- RS256 双轨 JWT 迁移
- 订单状态机完整实现
- SEO / i18n / Analytics 模块
- 多租户 KV 前缀铺垫
- 5 篇 reference 文档补充

## 2.1.0 — Phase 2 — 核心功能增强
## 2.0.0 — Phase 1 — 基础骨架搭建
## 1.0.0 — 初始版本
