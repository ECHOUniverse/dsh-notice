# 通知只能从客户端半发出，宿主半不参与投递

## Status

accepted

## Context

DSH 插件跑在 Electron 拉起的 **宿主 Node 子进程**里（`ELECTRON_RUN_AS_NODE`），不是 Electron 主进程，也不是浏览器。macOS 把通知归属于**发送它的那个 bundle 身份**，而这个身份**不跨 `exec/spawn` 继承**——所以任何"插件 spawn 一个命令去弹通知"的方案都拿不到 DeepSeek Harness 的身份：

- `osascript -e 'display notification'` → 归因到 Script Editor（或宿主终端，随版本漂移），无点击回调、无按钮；权限未开时**静默丢弃且不弹授权框**。
- `terminal-notifier` → 归因到 "Terminal Notifier"，需要用户额外授权；v3 已移除 `-sender`/`-appIcon`。
- Electron 主进程 `Notification` → 身份正确，但宿主插件**碰不到主进程**：两者唯一通道是 `process.send`，主进程白名单只认 `ready / platform-session / shutdown-complete / fatal / update-tasks / quit-inspection`，**发其它消息会被判 fatal 并 SIGTERM**；preload 也没有 notify 通道。
- 自建原生 helper → 身份独立，需另签名与公证，成本最高。

同时，"前台抑制"需要知道窗口是否聚焦、"点击回跳"需要点击回调——这两件事**只有浏览器渲染进程里的 `Notification` 能提供**：它由 Electron 原生层以宿主 app 的 bundle 身份投递，click 事件回到渲染进程。

## Decision

本项目是**双半插件**：宿主半只做一件事——声明带 `.volatile()` 的 `Config`，让设置表单有落脚点；**通知只从客户端半用 `new Notification()` 投递**，不实现任何服务端兜底通道。

真机验证（2026-10-18，`log show --predicate 'process == "usernoted"'`）：

```
Connection com.deepseek.dsh with path: /Applications/DeepSeek Harness.app
Sending request for permission for com.deepseek.dsh
authorizationStatus: Denied … Presenting … as none        ← 首条通知在授权决定前被丢弃
com.apple.notificationcenter.askpermissions … as alert     ← 系统授权框
```

授权后第二条通知弹出横幅，发送者显示为 **DeepSeek Harness**。

## Consequences

- 桌面 App 关闭、或 `dsh web` 页面没开时，**没有任何通知**。这是明确接受的取舍（用户已确认不承诺 App 退出后的通知）。
- 客户端半只能订阅 26 个转发事件白名单：用 `api-session/status` 判"最终完成"、`api-session/error` 拿错误（只有一条字符串，无 `LlmFailure` 结构）、`user-questions/request` 与 `approval/request` 旁听等审批。`agent/status`、`agent/error`、`subagent/*` **不可达**，因此「子智能体完成通知」不做。
- **首条通知会丢**：系统授权状态是 notDetermined 时，横幅被静默丢弃，而应用层 `Notification.permission` 仍是 `granted`。所以设置页必须提供「通知权限状态」显示与「发送测试通知」按钮——这是唯一的自检手段。
- 通知对象必须被强引用持有（Electron 在对象析构时会把它从通知中心移除）；"同会话替换"要自己保存引用并 `close()` 旧对象，不能依赖 `tag`。
- 若将来要覆盖"App 关闭后仍通知"，那是新增一条独立通道（服务端 + terminal-notifier），不是本 ADR 的回滚；但用户将看到另一个发送者身份。

## Considered Options

- **服务端插件 + osascript**：事件最全、覆盖 web/acp/headless，但身份是 Script Editor、无回调、权限失败静默——不可接受。
- **服务端插件 + terminal-notifier**：身份仍非本 app，需用户额外授权，图标不可定制。
- **修改 Electron 主进程加 notify IPC**：属于改 DSH 本体，超出插件范围。
- **自建签名 helper app**：身份独立但需另签名/公证，工程量与分发成本远超收益。
