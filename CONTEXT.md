# dsh-notice

DeepSeek Harness 桌面版的通知扩展：当 agent 完成任务、向用户提问、出错或申请权限时，通过 macOS 系统通知告知用户。它是一个双半 DSH 插件，装进 `desktop` profile。

## Language

**通知通道** (Notification Channel):
把一条通知送到 macOS 通知中心的那条物理路径。本项目的通道是 Electron 渲染进程的浏览器 `Notification`，它由 Electron 原生层以 DeepSeek Harness 的 bundle 身份投递。
_Avoid_: 推送、提醒、弹窗

**触发事件** (Trigger):
满足"值得打断用户"的四种 agent 状态之一：完成、提问、错误、权限。四者各自有独立开关，判定来源互不相同，不能合并成一个"通知"概念。
_Avoid_: 通知类型、事件

**待处理交互** (Pending Interaction):
某个会话当前正在等用户回应的请求，可能是提问、计划审阅或权限申请。同一会话同时只对外暴露优先级最高的一个。
_Avoid_: pendingInteraction、挂起请求、等待事件

**最终完成** (Final Completion):
agent 进入彻底空闲——没有运行中的任务、没有排队输入——的那一刻；不是每个 turn 结束都算。
_Avoid_: 任务结束、turn 结束、完成

**双半插件** (Two-half Plugin):
同时带宿主半与客户端半的插件。宿主半在 DSH 的 Node 宿主进程里运行，负责声明可持久化的配置；客户端半在 Web UI 的浏览器渲染进程里运行，负责发通知与渲染设置表单。
_Avoid_: 前端/后端、UI 插件、插件包

**前台抑制** (Foreground Suppression):
桌面窗口处于前台时不发送通知，因为用户已经在看。它是默认行为，不是静音。
_Avoid_: 免打扰、静音模式

**脱敏** (Redaction):
通知正文默认不含提示词原文、模型输出片段与完整命令，只保留结构化事实（会话标题 + 事件类型 + 少量计数/时长）。
_Avoid_: 截断、隐藏、打码

**同会话替换** (Per-session Replace):
同一会话的新通知顶掉该会话的旧通知，使通知中心里每个会话最多留一条；不同会话之间互不覆盖。
_Avoid_: 去重、节流、合并、防刷屏

**volatile 配置**:
DSH 中可被设置表单就地修改、无需重载插件的配置字段。只有声明为 volatile 的字段才会出现在设置界面；非 volatile 字段的写入会被拒绝。
_Avoid_: 热更新配置、动态配置、可写配置

**权限状态** (Permission Status):
macOS 系统层对"DeepSeek Harness 能否发通知"的授权结果。它与浏览器侧的 `Notification.permission` 不是一回事：后者在本应用里恒为 granted，前者可能仍未决定或被拒绝，且失败时静默丢弃。
_Avoid_: 通知开关、通知权限
