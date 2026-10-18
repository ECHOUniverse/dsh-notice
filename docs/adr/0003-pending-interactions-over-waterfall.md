# 用 `uiSession.sessionStatus` 观察待处理交互，不监听 waterfall 事件

## Status

accepted

## Context

DSH 把「agent 向用户提问」和「agent 请求权限」转发到浏览器时用的是 **waterfall 事件**（`user-questions/request`、`approval/request`）：监听器按注册顺序被调用，谁返回答案谁就 claim 整个请求，后面的监听器不再执行。

官方 UI 插件（`dsh-client-ui-user-questions`、`dsh-client-ui-approval`）在能展示卡片时会 `await` 用户回答并返回答案——也就是 **claim**，只在 `scopeOf(owner)` 为 undefined 或 delegation 时才调用 `next()`。而第三方插件通过 `dsh plugin add` 安装时，其 bundle 被**追加在 `dsh.profile.bundles` 末尾**，loader 行顺序必然在官方插件之后，于是它的 waterfall 监听器**永远不会被调用**。

真机证据（2026-10-18）：

```
[dsh-notice] applied Object
[dsh-notice] notify:skip complete foreground
… 从未出现 waterfall question
```

同时系统日志在提问时刻没有任何通知记录，排除了"通知被前台抑制"的可能。

结论：**waterfall 对晚加载的第三方插件不可用**，这不是配置问题，而是 claim 语义的必然结果。

## Decision

不监听这两个 waterfall。改为订阅客户端 `uiSession` 服务的状态源：

```ts
ctx.uiSession.sessionStatus: ObservableSnapshot<Map<SessionId, SessionStatus>>
interface SessionStatus {
  running: boolean | undefined
  pendingInteraction: SessionPendingInteraction | undefined
  completionUnread: boolean
}
```

官方插件 claim 之后会把等待中的交互**发布**到这个源里；我们只读它，因此与注册顺序无关。按 `pendingInteraction.kind` 映射触发类型（`approval` → 权限；`question` / `plan-review` → 询问），用 `key` 做去重，交互消失即清除记录。

## Consequences

- 两类"等待用户"的通知都变得可靠，且页面刷新后仍能对已存在的等待发一次提醒。
- 同一会话**只暴露优先级最高的一个** pending interaction（`plan-review` > `question` > `approval`），因此并发多个时只通知一个。这是框架的既有语义，已写入 README 已知限制。
- 依赖 `uiSession` 客户端服务；部署里没有该服务时插件必须优雅降级（只保留完成/错误通知），已用测试覆盖。
- 如果 DSH 改变 pending interaction 的发布方式（例如改用 projection），这里要跟着换——但换的是"读哪个源"，不是"要不要 claim"。
- 不要"顺手"把监听器加回 waterfall：即使某天它偶然生效，也会与 `sessionStatus` 路径**双发**。

## Considered Options

- **监听 waterfall**：被 claim 挡住，实测从未触发。
- **调整 profile 的 bundle 顺序**让本插件行排到官方插件之前：能解决，但 `dsh plugin add` 总是追加，用户无法复现，不可分发。
- **`userQuestions` 会话投影**：能覆盖询问（仅 timed ask），但权限没有对应投影，四类触发会缺一类。
- **宿主半轮询 + 自定义 RPC**：需要额外的 RPC 注册与轮询，延迟与复杂度都高于直接读 `sessionStatus`。
