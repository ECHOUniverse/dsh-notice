# dsh-notice：全部本地智能体完成后再通知（实施规格）

- 状态：可直接实施
- 日期：2026-11-08
- 依据：[all-agents-completion 调研](research/all-agents-completion.md)、[CONTEXT.md](../CONTEXT.md)、[ADR 0001](adr/0001-notification-channel.md)、[ADR 0002](adr/0002-handwritten-client-bundle.md)、[ADR 0003](adr/0003-pending-interactions-over-waterfall.md)、[M1 规格](m1-spec.md)
- 范围：只调整客户端半的“最终完成”判定与投递时机；不发布 issue，不修改除本文件以外的任何文件。

## Problem Statement

### 现状

当前完成通知的判定对象是“单个会话”：任意 `api-session/status` 的 `running` 从 `true` 变为 `false`，就按该会话发一条“已完成”。实现上只记录该会话自己的开始时间，子会话仅在通知投递前被 `origin === 'subagent'` 过滤掉，并没有参与“是否全部完成”的判定。

DSH 的正常时序却不是“父会话结束即全部结束”。subagent 工具在子 Agent 发布后立即返回 child id，父 Agent 可以继续工作并先结束自己的 turn；子 Agent 结算后会给父 Agent 发 completion notice，父 Agent 可能因此再起一个 turn。也就是说，“父会话 idle、子会话 running”是 DSH 的合法中间态，而不是完成。

### 根因

1. **判定对象选错**：`api-session/status` 是 per-session 事件，不是 per-tree 事件。父会话的 `false` 只代表父 Agent 自己的 loop 进入 idle，不代表后代 Agent 已经结束。
2. **子会话过滤没有参与完成判定**：现有 `origin === 'subagent'` 过滤只阻止子会话单独弹通知，不会阻止父会话在子会话仍运行时提前弹通知；子会话随后结束时也不会补发。
3. **待处理交互没有参与完成判定**：子会话可能正在等待提问或审批，但父会话的 `false` 仍可能触发“已完成”。现有 `uiSession.sessionStatus` 已能读到 `pendingInteraction`，只是没有用于阻断完成。
4. **没有公开的“整棵树 idle”信号**：客户端只能自行聚合 `api-session/status`、`ctx.sessions.list` 和 `ctx.uiSession.sessionStatus`。Host 半的 `waitForChildren` 不在浏览器 Remote 面上；external subagent 没有本地 Session，客户端无法观察。

### 本期要解决的缺口

把“最终完成”的判定从“某个会话自己变为 idle”改成“**根会话及其全部可观察本地后代会话都不 running，且子树没有待处理交互，并经过固定静默窗口确认**”。这必须在不新增用户配置、不改变四类触发开关和通知通道、不改变子会话现有提问/审批/错误通知行为的前提下完成。

## Solution

### 核心思路

采用**客户端公开服务聚合 + root-anchored 周期 + 2000ms 固定静默窗口**：

1. **root-anchored**：只有根会话自己出现 `running = true` 时才开启一个通知周期。子会话单独被唤醒、单独运行、单独结束，都不新建周期。
2. **子树完成条件**：根会话与所有可观察的本地后代会话（本地 subagent、Agent Teams teammate，任意深度）都不 running；子树内没有任何 `pendingInteraction`；没有“暂不可归属”的会话在 running 或等待交互。
3. **静默窗口**：子树首次满足完成条件时，记录静默起点并启动 2000ms timer。窗口内任何 running、新运行子会话、pending 出现，都取消 timer；窗口到期重新读取当前 `ctx.sessions.list` 与 `ctx.uiSession.sessionStatus`，仍然静默才投递。
4. **每周期最多一条**：一个周期最多产生一条完成通知，仍以根会话 ID 做“同会话替换”的 key。通知标题、项目目录、耗时口径都以根会话为准。
5. **不新增配置、不新增文案**：继续使用现有 `notifyOnComplete` 开关、现有四类开关、现有通知通道和现有“已完成”文案；不新增静默时长配置、不新增子会话开关、不新增“全部 N 个智能体”文案。
6. **边界明确**：子会话的 question/approval/error 现有过滤与通知行为不变；pending 仅用于阻止完成；失败、取消、后台 job 不引入新语义；external subagent 不可观察，不承诺等待。

### 判定输入与输出

| 输入 | 用途 |
|---|---|
| `api-session/status(sessionId, running)` | 每个会话 running 的主信号；子会话同样会收到 |
| `api-session/added(summary)` | 建立/修正父子关系、origin、running 基线 |
| `api-session/removed(sessionId)` | 清理会话并重新评估其所属根会话 |
| `ctx.sessions.list` 快照与订阅 | 父子关系与 running 的公开基线；窗口到期时的权威重读来源之一 |
| `ctx.uiSession.sessionStatus` | 子树 `pendingInteraction` 的唯一来源；只用于阻断完成，不用于 running 判定 |
| `ctx.configForms`、浏览器 `Notification` | 现有配置读取与客户端半投递，不改变 |

### 为什么需要静默窗口

子 Agent 结束后，父 Agent 会收到 settlement notice，可能立即被唤醒并再起一个 turn。如果“子会话 false”就立刻判定完成，会在父 Agent 被唤醒前发一条，等父 Agent 再次完成后又发一条。2000ms 静默窗口 + 到期重读，是用客户端公开面近似 Host 半“父会话保持 idle 且 Session sequence 不变”的确认条件。

### 成功判据

- 子会话仍在运行时，根会话结束不产生完成通知。
- 子会话结算唤醒父会话再结束时，整个协作只产生一条完成通知。
- 任意深度后代、本地 subagent 与 teammate 都参与判定。
- 子树有 pending 时不产生完成通知；pending 清除后经过静默窗口才产生。
- 多根会话互不串扰；每个根会话每周期最多一条，仍按根会话替换。
- 现有四类触发、设置页、构建契约和子会话通知过滤不回归。

## User Stories

1. 作为桌面用户，我希望主会话和它的全部本地子会话都结束运行、且没有任何待处理交互后，才收到一条完成通知，以便不会在子任务仍在进行时误以为工作已经结束。
2. 作为离开工位的用户，我希望完成通知在整棵本地子树连续 2 秒没有新的运行或待处理交互后才出现，以便父子交接的瞬时空闲不会产生过早或重复的通知。
3. 作为使用本地 subagent 的用户，我希望任意深度的子会话和孙会话都参与完成判定，以便深层委派不会被漏掉。
4. 作为使用 Agent Teams 的用户，我希望 teammate 与普通 subagent 走同一套完成判定，以便团队协作结束时只收到一条以根会话为上下文的通知。
5. 作为同时运行多个根会话的用户，我希望每个根会话独立维护自己的完成周期，以便一个会话的完成不会掩盖或延迟另一个会话的通知。
6. 作为关注通知整洁的用户，我希望每个根会话的每个周期最多产生一条完成通知，并按根会话替换旧通知，以便通知中心不会堆积同一任务的重复提醒。
7. 作为已经配置完成通知的用户，我希望继续使用现有的“最终完成”开关，而不需要学习新的子会话开关或静默时长配置，以便升级后行为可控。
8. 作为关闭完成通知的用户，我希望周期仍然正常结束但不投递、也不在以后补发，以便之后不会突然收到过期通知。
9. 作为在前台工作的用户，我希望前台抑制继续生效，并且被抑制的周期不会被重放，以便切换窗口后不会收到已经过时的提醒。
10. 作为刷新页面的用户，我希望页面挂载时只建立基线、不因为初始空闲补发完成通知，以便刷新不会产生历史完成提醒。
11. 作为在任务中途打开页面的用户，我希望挂载时已经运行中的根会话在后续完成时仍能通知，以便中途打开页面不会丢掉这次提醒。
12. 作为只唤醒某个子会话的用户，我希望子会话单独开始运行时不新建完成周期，以便 teammate 的单独往返不会产生额外通知。
13. 作为在根会话周期内启动子会话的用户，我希望新的运行中子会话会取消或重排静默窗口，以便子任务启动时不会提前判定完成。
14. 作为等待子会话提问或审批的用户，我希望子树里存在待处理交互时不发完成通知，以便在仍需我操作时不会误报完成。
15. 作为只关心根会话上下文的用户，我希望通知标题和项目目录仍来自根会话，以便不会被某个子会话的标题或路径误导。
16. 作为隐私敏感用户，我希望聚合后的完成通知仍然不包含子会话的提示词、模型输出或完整命令，以便脱敏边界不因聚合而扩大。
17. 作为使用英文界面的用户，我希望完成文案继续复用现有本地化 key，以便聚合改动不会引入未翻译的新文案。
18. 作为使用 external subagent 的用户，我希望规格明确说明不可观察的外部子代理不会被等待，以便对通知时机有正确预期。
19. 作为运行后台 job 的用户，我希望本期不把 job 纳入完成判定，以便行为与当前版本一致且可预测。
20. 作为遇到运行失败或取消的用户，我希望本期不新增失败/取消的判定语义，以便不会出现未经验证的“失败也算完成”或“取消被隐藏”的额外规则。
21. 作为只想收到现有四类通知的用户，我希望子会话的提问、审批和错误仍然沿用现有过滤与文案，以便本期不扩大通知面。
22. 作为移除运行中子会话的用户，我希望移除后立即重新评估根会话，以便完成通知不会因为一个已经消失的子会话永久卡住。
23. 作为关闭窗口或卸载插件的用户，我希望所有静默计时器和聚合状态都被清理，以便后台不会残留计时器或在卸载后弹出通知。
24. 作为插件维护者，我希望聚合只依赖 DSH 的公开客户端服务和转发事件，以便 DSH 升级时可以通过防御式读取降级，而不是依赖私有字段。
25. 作为插件维护者，我希望客户端继续是手写经典脚本、不引入打包器，以便遵守 ADR 0002 并保持产物可审计。
26. 作为插件维护者，我希望待处理交互继续从 `uiSession.sessionStatus` 读取、不订阅 waterfall，以便不被官方插件的 claim 顺序挡住。
27. 作为测试者，我希望通过现有 client harness 驱动公开事件、列表快照和 FakeNotification 来验证外部行为，以便测试不依赖生产代码的测试专用接口。
28. 作为测试者，我希望 harness 提供可控的 2 秒 timer 和 `sessions.list` 订阅，以便验收矩阵可以稳定、快速地覆盖静默窗口。
29. 作为接手实现的开发者，我希望规格给出完整的状态机、事件语义和边界表，以便不需要再做产品决策就能直接编码。
30. 作为发布者，我希望现有的四类触发、设置页和构建契约保持不变，以便这次改动可以按最小回归面发布。

## Implementation Decisions

### 1. 总原则与不变量

以下规则同时成立，任何实现不得只满足其中一部分。

1. **判定对象是根会话子树**：完成判定以 root 为单位，不以单个 session 为单位。根会话是 `origin !== 'subagent'` 的普通会话；fork 不继承 parentSession，因此也是根会话。
2. **只有根会话 running 才开启周期**：根会话自己出现 `running = true`（或挂载基线显示根会话 running）才创建周期。子会话单独 running 永远不创建周期，只在已存在的根周期内阻止完成。
3. **完成条件是四件事同时成立**：根会话与全部可观察本地后代会话都不 running；子树无任何 `pendingInteraction`；没有暂不可归属的 running/pending 会话；2000ms 静默窗口到期且权威重读仍静默。
4. **每周期最多一条**：一个周期只允许一次完成投递；被配置关闭或前台抑制时，周期照样消费，不重试、不补发。周期消费后，新的根会话 `running = true` 才开启新周期。
5. **通知归属根会话**：标题、项目目录、耗时、点击后的 sessionId、同会话替换 key 全部使用根会话 ID。子会话不单独产生完成通知。
6. **不新增用户配置**：不新增静默时长、子会话范围、tree-anchored 开关等字段；不改宿主半配置 schema；不改设置页字段与摘要；不新增 locale key。
7. **子会话现有通知行为不变**：子会话的 question/approval/error 继续被现有 `isSubagent` 过滤；`pendingInteraction` 只用于阻止完成，不用于新增通知。
8. **只在客户端半投递**：不改变 ADR 0001 的投递结论；不新增 Host 半逻辑、Remote 通道、原生 helper 或服务端兜底。
9. **只使用公开面**：只使用转发事件、`ctx.sessions.list`、`ctx.uiSession.sessionStatus`、`ctx.configForms` 等公开服务；不读私有 projection、不读 `subagentCatalog` 当作执行状态、不调用 Host-only `waitForChildren`。
10. **无回填、无轮询**：页面挂载/刷新只 seed；不因初始 idle 补发历史完成。完成判定只由事件驱动，静默窗口只用一个 `setTimeout`，不用 interval 轮询。

### 2. 公开服务与数据模型

#### 2.1 公开输入

- `api-session/status`：per-session 的 running 变化，子会话同样会发出。
- `api-session/added`：wire summary，身份字段是 `sessionId`，包含 `parentSessionId`、`origin`、`running`、`cwd` 等。
- `api-session/removed`：会话销毁。
- `api-session/error`：现有错误通知来源；不参与完成判定。
- `ctx.sessions.list.getSnapshot()` 与 `subscribe`：客户端会话列表公开 store；行身份字段是 `id`，包含 `running`、`parentId`、`origin`、`cwd`、`retainedBy` 等。
- `ctx.uiSession.sessionStatus.getSnapshot()` 与 `subscribe`：`Map<SessionId, { running, pendingInteraction, completionUnread }>`；本期只用 `pendingInteraction` 做阻断。
- `ctx.configForms`、`ctx.locale`、`ctx.slots`：现有配置、文案、设置页服务，不改变。

#### 2.2 归一化会话记录

内部把 wire summary 和 list row 归一化成同一条记录：

| 字段 | 含义 | 来源 | 约束 |
|---|---|---|---|
| `id` | 会话身份 | status 的 sessionId、added 的 sessionId、list 的 id | 字符串；不做前缀/数组位置推断 |
| `parentId` | 直接父会话 | added 的 parentSessionId、list 的 parentId | 只有 `origin === 'subagent'` 时才作为树边 |
| `origin` | 会话来源 | added/list | `'subagent'` 表示子会话；缺省/其他表示根会话 |
| `running` | 是否运行 | status、added、list | 允许未知；只有属于快照 `ids` 的 Host 列表行才建立/纠正 running；仅存在于 `byId` 的回退行不建立 running |
| `hostListed` | 是否属于 Host 列表基线 | 快照 `ids` 是否包含该 id；added 也可建立 Host 观察 | 用 `ids` 区分权威行与仅合成到 `byId` 的 catalog/retained fallback 行 |

#### 2.3 聚合状态

| 状态 | 键 | 内容 | 用途 | 清理时机 |
|---|---|---|---|---|
| `sessionMeta` | sessionId | parentId、origin、hostListed | 解析根会话与后代、识别 Host 列表行 | removed、dispose |
| `runningState` | sessionId | boolean | 计算子树 busy | removed、dispose |
| `pendingBySession` | sessionId | pendingInteraction | 计算子树待处理交互 | 交互消失、removed、dispose |
| `cycles` | rootId | cycle record | 状态机 | 消费、取消、dispose |
| `unattributedRunning` | sessionId | 标记 | 暂不可归属的 running 全局阻断 | 元数据到达、running=false、removed、dispose |
| `unattributedPending` | sessionId | 标记 | 暂不可归属的 pending 全局阻断 | 元数据到达、pending 清除、removed、dispose |
| `listBaselineReady` | 无 | boolean | 基线未就绪时不得排静默 timer | dispose |
| `disposed` | 无 | boolean | dispose 后所有 handler/timer 立即返回 | 无 |

cycle record 至少包含：

| 字段 | 含义 |
|---|---|
| `rootId` | 根会话 ID |
| `state` | `Active` 或 `Quiet` |
| `startedAt` | 本周期第一次观察到根会话 running 的时间 |
| `durationKnown` | 只有由 `api-session/status` 的根 `running = true` 事件创建的周期才为 true；seed/added 创建的周期为 false |
| `quietSince` | 子树最近一次进入静默的时间；用于耗时，不能用 timer 到期时间代替 |
| `timer` | 唯一的静默 timer handle；只在 `Quiet` 状态存在 |

现有 live notification map、`announcedPending`、`subagentSessions`/`isSubagent`、配置读取、`sessionFacts` 继续保留。新的聚合状态与 live notification 分开，不把 cycle 状态塞进通知对象。

#### 2.4 不新增生产测试接口

不导出聚合状态，不增加 debug hook，不增加“测试模式”分支。测试只能通过 `apply(ctx)`、公开事件、公开 store 快照和 `FakeNotification` 观察行为。

### 3. 根会话、后代与可观察子树

#### 3.1 定义

- **根会话（root）**：`origin !== 'subagent'` 的本地会话。即使该行带有 `parentId`，只要 origin 不是 subagent，就按根会话处理（fork 不继承 parentSession）。
- **子会话（child）**：`origin === 'subagent'` 且能沿 `parentId` 链走到某个 root 的会话。本地 subagent 与 Agent Teams teammate 都属于这一类。
- **可观察本地子树**：root 自身，加上所有能通过已知本地元数据沿 parent 链到达该 root 的后代，任意深度。
- **未归属会话（unattributed）**：有 running/pending 观察，但没有任何元数据能判断它是 root 还是 child。
- **孤儿子会话（orphan）**：有元数据，但 parent 链缺失、成环或超过深度守卫，无法到达任何 root。

#### 3.2 根解析

对任意 sessionId：

1. 如果 `sessionMeta` 中没有该 ID，先尝试从当前 `ctx.sessions.list` 快照做一次单点读取；读到行则归一化入库。仍然没有元数据，则标记为未归属，不猜测。
2. 如果 `origin !== 'subagent'`，该 ID 就是根会话。
3. 如果 `origin === 'subagent'`，沿 `parentId` 向上走；每一步都要求父会话有元数据。
4. 父会话缺失、父链成环、或超过 64 层守卫，返回 orphan。
5. 走到一个 `origin !== 'subagent'` 的会话，返回该会话作为 root。

深度守卫 64 只是防环/防异常，不是产品上的最大深度限制。

#### 3.3 后代判定

从候选 ID 沿 parent 链向上走，维护 visited 集合，最多 64 步；只有最终到达目标 root 才返回 true。root 自身返回 true。不要用 ID 前缀、数组顺序、catalog 顺序做父子判断。

#### 3.4 元数据合并规则

- `api-session/added`：把 `sessionId`、`parentSessionId`、`origin`、`running` 归一化入库；有 running 布尔值时才更新 running。
- `ctx.sessions.list` 行：把 `id`、`parentId`、`origin` 归一化入库，并用快照 `ids` 是否包含该 id 计算 `hostListed`；`running` 按下述规则更新。
- **Host-listed 行**：id 属于快照 `ids`。这种行的 `running` 可以作为 running 基线。`retainedBy` 只是界面引用计数，普通主会话也可能有 `mainView` 等引用，不得用它判断行是否权威。
- **retained fallback / catalog-only 行**：只存在于 `byId`、不属于快照 `ids`。只使用它的成员/父子/路径元数据，不把它的 `running = false` 当作“子会话已停止”；这类会话的 running 只由 `api-session/status` 或 Host 的 added 摘要建立。
- 初始化基线：只填充缺失的元数据和 Host-listed 行缺失的 running；不覆盖已经由事件观察到的 running。
- 后续列表快照：对 Host-listed 行，列表 running 是权威值，可以纠正缓存；对回退行，仍然只合并元数据。
- 静默窗口到期重读：同后续列表快照规则，Host-listed 行权威；回退行不因 false 清除 running。
- 列表快照中缺失某行不等于删除；删除以 `api-session/removed` 为准。

#### 3.5 未归属与孤儿的处理

- 未归属 running 或 pending 会进入全局阻断集合。只要集合非空，任何 root 都不得排静默 timer、也不得在 timer 到期时投递完成。周期保持 `Active`，等待元数据到达或观察消失。
- 元数据到达后，把该 ID 从全局阻断集合移除，按 root/child/orphan 重新分类，并重新评估所有活跃周期。
- 孤儿不创建周期、不阻止任何 root、不单独发通知。若父元数据后来到达，再重新解析；重新解析后按新归属评估。
- 不要把未归属会话当成 root，也不要把它归到“最近看到的 root”；这两种猜测都会造成误通知或漏通知。

### 4. 周期状态机

#### 4.1 状态

- **无周期（Dormant）**：该 root 没有 cycle。
- **Active**：cycle 存在，但子树不满足静默条件，或不允许排 timer。
- **Quiet**：cycle 存在，子树当前静默，已排 2000ms timer。
- **结束**：周期被消费（Consumed，可能已投递或被抑制）或被取消（Cancelled，不投递）。结束时从 `cycles` 删除。

#### 4.2 转移表

| 当前 | 触发 | 条件 | 结果 | 动作 |
|---|---|---|---|---|
| 无周期 | root `running=true`（status 事件或基线 seed） | root 可解析 | Active | 建周期；status 事件创建时设 `startedAt`、`durationKnown=true`；seed/added 创建时 `durationKnown=false`；不排 timer |
| 无周期 | 子会话 `running=true` 或 pending | root 可解析 | 无周期 | 只记录状态；不新建周期 |
| 无周期 | 未归属 running/pending | 无元数据 | 无周期 | 加入全局阻断集合；不排 timer |
| Active | 子树 running=true、pending 出现、新 running 子会话、未归属出现 | cycle 存在 | Active | 取消已有 timer；清 `quietSince` |
| Active | 子树仍 busy | — | Active | 不排 timer |
| Active | 子树 quiet，且无全局阻断 | — | Quiet | `quietSince = now`；排正好 2000ms 的唯一 timer |
| Active | 子树 quiet，但有全局阻断 | — | Active | 不排 timer；等待元数据/观察消失 |
| Quiet | 子树 running=true、pending 出现、新 running 子会话、未归属出现 | — | Active | 取消 timer；清 `quietSince` |
| Quiet | 真实的非 busy 变化（running=false、pending 清除）且仍 quiet | — | Quiet | 取消旧 timer；`quietSince = now`；重排 2000ms |
| Quiet | 重复观察，状态无变化 | — | Quiet | 保持 timer 与 `quietSince`，不重排 |
| Quiet | timer 到期，重读后 busy 或有全局阻断 | — | Active | 不投递；清 `quietSince`；等待下一次变化 |
| Quiet | timer 到期，重读后 quiet，且 root 仍是 root | — | Consumed | 先消费周期；按 `quietSince` 算耗时；投递一次 |
| Quiet | timer 到期，重读后 root 已移除/不再是 root | — | Cancelled | 取消周期；不投递 |
| 任意 | root 被 removed 或元数据变为非 root | — | Cancelled | 取消 timer；删除周期；不投递 |
| 任意 | dispose | — | Cancelled | 清 timer 与全部聚合状态；不投递 |
| Consumed/Cancelled | 新的 root `running=true` | — | Active | 新周期；`startedAt = now`；`durationKnown = true` |

#### 4.3 不变量

- 一个 cycle 最多一个 timer，且 timer 只在 `Quiet` 状态存在。
- 没有 `Quiet` 状态就不得投递完成通知；完成投递只能发生在 timer 到期回调中。
- `Active` 状态不排 timer；不要用短轮询或重复 `setTimeout` 代替事件驱动。
- `quietSince` 只在“子树真正进入静默”的那一刻设置；重复事件、元数据刷新、title 变化都不重置它。
- 周期消费必须发生在投递之前；投递被配置/前台/通知 API 抑制时，周期仍然消费，不重试。
- 同一 root 的同一周期最多投递一次；不同 root 的周期互不共享 timer、`quietSince` 或通知 key。

### 5. 事件处理语义

#### 5.1 `api-session/status`

1. 更新该 ID 的 `runningState`。
2. 若 `running = true`：
   - 若元数据缺失，做一次列表单点刷新；仍缺失则加入 `unattributedRunning`，不创建周期。
   - 若解析出 root：
     - 该 ID 就是 root：没有 cycle 则创建 cycle（status 事件创建，`durationKnown=true`，`startedAt=now`）；已有 cycle 则取消可能的 timer，保持/回到 `Active`。
     - 该 ID 是 child：若其 root 有 cycle，取消可能的 timer 并重新评估；若 root 没有 cycle，不做任何周期动作。
   - 若解析出 orphan：忽略，不加入全局阻断集合。
3. 若 `running = false`：
   - 从 `unattributedRunning` 移除该 ID。
   - 若元数据缺失，做一次列表单点刷新。
   - 若解析出 root 且该 root 有 cycle，调用评估；否则不做任何周期动作。
4. 该 handler 不得直接调用完成通知。完成通知只能由静默 timer 的到期回调触发。
5. 根会话的 `true` 不重置已有 cycle 的 `startedAt`；同周期内的多次 turn 共享同一个开始时间，直到周期被消费。
6. 如果子会话结算唤醒根会话，根会话的 `running=true` 按上述 root 规则创建/续用周期；这不属于“子会话单独唤醒”，不应被忽略。

#### 5.2 `api-session/added`

1. 校验 `sessionId`；归一化 `parentSessionId`、`origin`、`running`、`cwd`。
2. 更新元数据与 running；从 `unattributedRunning`/`unattributedPending` 移除该 ID。
3. 若该会话是 root 且 `running = true`，没有 cycle 则创建 seed cycle（`durationKnown=false`）。
4. 若该会话是 child 且 `running = true`，其 root 有 cycle 则取消 timer 并重新评估；没有 cycle 则不做周期动作。
5. 若该会话是 root 且 `running = false`，其 root 有 cycle 则评估。
6. 若该会话是 child 且 `running = false`，其 root 有 cycle 则评估。
7. 若 `parentId`/`origin`/`hostListed` 发生变化，重新解析所有已知会话的归属：取消不再成立的 root cycle；对新的 root running 情况创建 seed cycle；重新评估受影响的旧 root。
8. summary 没有 running 布尔值时，只更新元数据，不推断 false。

#### 5.3 `api-session/removed`

1. 删除前先计算该会话原来的 root（若可解析）以及它可能影响的周期。
2. 删除 `sessionMeta`、`runningState`、`pendingBySession`、`announcedPending`、`unattributedRunning`、`unattributedPending` 中的该 ID。
3. 关闭该会话的 live notifications（沿用现有 `closeSession` 行为）。
4. 若删除的是 root：取消其 cycle，清 timer，不投递完成。
5. 若删除的是 child：删除完成后重新评估原 root；若原 root 因此进入静默，按 2000ms 窗口排 timer。
6. 若删除的会话有后代，这些后代因父链缺失成为 orphan；重新评估所有活跃周期，它们不再阻止任何 root，也不再单独产生周期。
7. 若删除的是未归属会话，移除全局阻断标记，并重新评估所有活跃周期。
8. removed 不是完成信号，也不是错误信号；不得因为 removed 直接投递完成。

#### 5.4 `ctx.sessions.list` 基线与订阅

**首次成功基线**：

1. 从快照读取 `byId`（如果快照暴露 `phase`，只有 ready 才算就绪；否则以可读的 `byId` 对象为准）。
2. 归一化所有行；按 3.4 的“初始化基线”规则更新元数据和缺失 running。
3. 对每个 running 的 root 创建 seed cycle（`durationKnown=false`）。
4. 标记 `listBaselineReady = true`。
5. 初始化期间不排任何静默 timer；已存在的 cycle 只做 busy 取消，不投递。
6. 初始化结束后，对所有活跃 cycle 做一次评估：若 root 仍 running 则保持 Active；若 root idle 且没有 cycle 则不做事；seed cycle 不会因为“初始 idle”而投递。

**后续快照**：

1. 归一化并合并元数据；Host-listed 行的 running 作为权威值，可以纠正缓存；回退行只合并元数据。
2. 对每个真实 running 变化：`true` 取消受影响周期的 timer；`false` 重新评估受影响周期。
3. 新的 root running 且没有 cycle：创建 seed cycle（`durationKnown=false`）。
4. 元数据变化：按 5.2 第 7 条重新解析与评估。
5. 列表快照缺失行不删除；删除只由 removed 处理。

**订阅与降级**：

- 保存 `subscribe` 返回的取消函数，dispose 时调用。
- 若没有 `subscribe`，只做一次基线 seed，后续依赖 status/added/removed；不假装有实时列表。
- 若快照读取抛异常或形状不可读：记录警告；首次失败则 `listBaselineReady` 保持 false，不排静默 timer；后续失败保留已有状态，不投递。

#### 5.5 `ctx.uiSession.sessionStatus`

1. 每次快照变化，扫描所有 session 的 `pendingInteraction`；非 null 的进入 `pendingBySession`。
2. 对每个 pending 会话，若元数据缺失，做一次列表单点刷新；仍缺失则加入 `unattributedPending`；元数据存在则从集合移除。
3. 对快照中已经不再 pending 的会话，从 `pendingBySession` 与 `unattributedPending` 移除。
4. 现有“announce/去重/清除”逻辑保持不变：按 key 去重；approval/question/plan-review 走现有 `notify`；子会话继续被 `isSubagent` 过滤；未知 kind 不通知。
5. 新的阻断逻辑与现有 `announcedPending` 分开：`announcedPending` 只负责“是否已经通知过”，`pendingBySession` 只负责“当前是否阻断完成”。不要因为已经通知过就从阻断集合移除。
6. 任何 pending 增加/减少都重新评估受影响的活跃周期：增加则取消 timer、保持 Active；减少且子树 quiet 则重新排 2000ms。
7. 扫描失败时，保留上一版阻断集合，记录警告，不改变 cycle 状态；避免因为一次读取失败而误判完成。
8. `ctx.uiSession` 缺失或 `sessionStatus` 不可用时，不做 pending 阻断，完成判定只基于 running；这是现有降级方式，不崩溃。
9. 挂载时的初始快照只 seed 阻断集合；现有 pending 通知（若有）照旧，不排完成 timer。

**阻断语义**：任何非 null 的 `pendingInteraction` 都阻止完成，不管它的 kind 是否是 approval/question/plan-review，也不管它有没有 key。阻断是“用户是否还需要操作”，不是“是否会发通知”。

#### 5.6 `api-session/error`、question、approval

- `api-session/error`：继续按现有逻辑调用错误通知；子会话继续被 `isSubagent` 过滤。error 不改变 cycle 状态，不设置失败标记，不取消 timer。
- question/approval：继续由 `uiSession.sessionStatus` 驱动现有通知；子会话继续被过滤。pending 只按 5.5 阻断完成。
- 不订阅 `user-questions/request`、`approval/request` waterfall；不因为聚合改动而恢复 waterfall。
- 失败、取消、子会话错误都不新增完成文案/完成判定语义；根会话出错后如果随后进入 idle，现有行为仍是“错误通知 + 之后可能完成通知”，本期保持。

#### 5.7 重复与无变化事件

- 先比较归一化后的旧值；相同值的重复 status/added/pending 不取消、不重排 timer，也不重复投递。
- 已 Consumed/Cancelled 的周期忽略迟到事件，除非是新的 root `running=true`，后者开启新周期。
- 同一 root 的 `startedAt` 在周期内不因重复 `true` 重置。

### 6. 静默窗口与权威重读

#### 6.1 常量

- `QUIET_MS = 2000`，固定在客户端半内部。
- 不暴露为用户配置，不读取 `configForms`，不因 DSH locale/设置页变化而改变。
- 不使用 interval、轮询或“多次采样求平均”；一个 cycle 一个 timer。

#### 6.2 进入静默

只有同时满足以下条件才从 `Active` 进入 `Quiet`：

1. cycle 存在且 root 仍解析为 root。
2. `listBaselineReady === true`。
3. `unattributedRunning` 与 `unattributedPending` 都为空。
4. 根会话与所有可观察本地后代都不 running。
5. 子树没有任何 `pendingBySession` 条目。

进入时设置 `quietSince = Date.now()`，清除可能存在的旧 timer，排一个新的 2000ms timer，状态置 `Quiet`。

#### 6.3 取消与重排

- 任何真实的 busy 增加（running=true、pending 出现、新 running 子会话、未归属出现）都取消 timer，状态回 `Active`，清 `quietSince`。
- 任何真实的 busy 减少（running=false、pending 清除）都先取消旧 timer，再重新评估：若仍 busy，保持 `Active`；若已 quiet，按 6.2 重新设置 `quietSince` 并排完整 2000ms。
- 重复/无变化观察不取消、不重排。
- 列表元数据变化、title 变化、projection 变化不重置 `quietSince`，除非它们改变了 busy 归属。

#### 6.4 timer 到期

timer 回调必须按以下顺序执行：

1. 立即清空并移除 timer handle；若已 dispose、cycle 不存在或状态不是 `Quiet`，直接返回。
2. 重新读取当前 `ctx.sessions.list` 快照与 `ctx.uiSession.sessionStatus` 快照；按 3.4/5.5 规则合并。读取失败或形状不可读：记录警告，置 `Active`，不投递，等待下一次事件。
3. 重新解析 root；若 root 已移除、不再是 root、或无法解析，取消 cycle，不投递。
4. 重新计算全局阻断集合；非空则置 `Active`，不投递。
5. 重新计算子树 busy；busy 则置 `Active`，不投递。
6. 如果这次重读把某个缓存为 busy 的会话改成了 idle（例如列表纠正了一个 running=true，或 pending 消失），说明刚刚发生了新的静默转移：把 `quietSince = Date.now()`，重新排完整 2000ms，不投递。
7. 否则仍然静默：先消费 cycle（从 `cycles` 删除），再调用完成投递一次。
8. 投递时读取根会话 facts、配置与前台状态；被抑制也算消费，不重试。

#### 6.5 耗时口径

- 只有 `durationKnown === true` 的周期才带耗时。
- `durationMs = max(0, quietSince - startedAt)`；`quietSince` 是子树最后一次进入静默的时间，不是 timer 到期时间。2000ms 静默窗口本身不计入耗时。
- 由页面挂载 seed 或 `api-session/added` 创建、而不是由根 `api-session/status` `running=true` 事件创建的周期，`durationKnown=false`，使用无耗时的 `body.complete`。
- seed/added 创建的周期把 `startedAt` 记为创建时刻，仅用于记账；`durationKnown` 在周期创建时固定，seed/added 周期不会因为后续根 `true` 而升级。
- 同一周期内根会话多次 turn 不重置 `startedAt`；耗时覆盖整个协作周期，直到最后一次静默。

### 7. 待处理交互的阻断语义

1. 只有 `ctx.uiSession.sessionStatus` 是 pending 来源；不读 waterfall，不读 `subagentTiming`，不读 `agentTeam` 当 pending。
2. `pendingInteraction` 非 null 即阻断；优先级、key、kind 都不影响“是否阻断”，只影响现有通知的去重与文案。
3. 阻断范围是 root 自身 + 所有可观察本地后代。孤儿的 pending 不阻断任何 root；未归属 pending 进入全局阻断集合。
4. pending 出现时取消 timer；pending 消失时重新评估并重排完整 2000ms。
5. 子会话 pending 继续不单独通知（现有 `isSubagent` 过滤），但仍阻断完成；这是本期明确保留的行为，不新增“子智能体需要你”的通知。
6. `sessionStatus.running`、`completionUnread` 不用于完成判定；running 只来自 status 事件和列表基线/重读。
7. 缺失 `uiSession` 时，pending 集合为空，完成判定只基于 running；不崩溃，不尝试用 waterfall 兜底。

### 8. 完成通知的投递

1. **key 与归属**：使用 root sessionId 作为 live notification 的 session key；`replaceBySession !== false` 时先关闭该 root 的旧通知，再显示新通知。
2. **标题**：沿用现有 `sessionFacts` 的根会话 facts：`projectionsBySession[root].values.title`，为空则根 cwd 的 basename，再为空则 app name；`showSessionTitle === false` 时用 app name。不得使用子会话标题。
3. **正文**：复用现有 `body.complete` / `body.completeWithDuration`；项目段继续用根会话 cwd 的 basename。不要新增“全部 N 个智能体已完成”或任何新 locale key。
4. **耗时**：按 6.5；`durationKnown=false` 时不传 `durationMs`，走 `body.complete`。
5. **声音**：沿用 `soundPolicy`；`smart` 下 complete 仍然 silent。
6. **前台抑制**：在投递时（timer 到期后）读取 `document.hasFocus()`；前台则抑制，但 cycle 已消费，不重放。
7. **配置**：在投递时读取 `configForms` 的 `notifyOnComplete`；关闭则抑制，但 cycle 已消费。不要因为开关关闭就不维护 cycle；开关是投递时读取的 volatile 配置。
8. **通知 API 不可用/投递异常**：沿用现有 `showNotification` 的防御式行为；cycle 已消费，不重试。
9. **点击**：沿用现有行为，`window.focus()` 并关闭该通知；`lastClickedSessionId` 记录 root ID，供 M2 导航使用。
10. **子会话**：不产生完成通知；不要因为子会话结束而调用 `notify` 完成。

### 9. 初始化、挂载与刷新

`apply(ctx)` 的初始化顺序必须确定：

1. 置 `disposed = false`，初始化所有聚合 Map/Set，不创建 timer。
2. 读取 `ctx.sessions.list` 快照；若可读，按 5.4 做首次 seed，标记 `listBaselineReady = true`；对 running 的 root 创建 seed cycle，但不排 timer。
3. 读取 `ctx.uiSession.sessionStatus` 初始快照；更新 `pendingBySession` 与未归属集合；执行现有 pending announce（保持 ADR 0003 行为）；不排完成 timer。
4. 订阅 `ctx.sessions.list`、`ctx.uiSession.sessionStatus`，并注册 `api-session/status`、`api-session/added`、`api-session/removed`、`api-session/error` 的现有 handler。
5. 订阅建立后做一次评估：若 `listBaselineReady` 且某个活跃 cycle 已静默，按 2000ms 排 timer；若 root 仍 running，保持 Active。
6. 初始化期间和初始化结束都不得因为“初始 idle”投递完成通知。

补充规则：

- 页面刷新 = 新的 `apply` = 上述 seed；不补发历史完成。
- 挂载时根会话已 running：seed cycle 存在，后续 `running=false` 后经过 2000ms 可通知。
- 挂载时只有子会话 running、根会话 idle：不建 cycle；子会话结束后也不通知。
- 挂载时 pending 初始快照仍按现有逻辑发 root 的 question/approval 通知；这不是完成通知，不受“不补发完成”限制。
- 同一页面内的实时列表刷新/重连不是新的 mount seed，而是后续快照；它可以完成一个已存在的 cycle（经过 2000ms），但不会凭空创建 root cycle。
- 没有 `ctx.sessions.list` 基线时，不排静默 timer；保持 Active，等待基线或后续事件。不要退回“每个会话 false 就通知”的旧行为。

### 10. 移除、元数据变化与清理

- root 被移除：取消 cycle、清 timer、关闭该 root 的通知；不投递完成。
- child 被移除：清除其元数据/running/pending，重新评估原 root；若原 root 因此静默，按 2000ms 排 timer。
- child 被移除后留下的后代：父链缺失，成为 orphan；不再阻止任何 root，也不再单独产生周期。若父元数据后来恢复，重新解析并评估。
- 未归属会话被移除：从全局阻断集合移除，重新评估所有活跃周期。
- 元数据变化（added 重新声明 parent/origin、列表行变化）：重新解析所有已知会话；取消不再成立的 cycle；为新的 running root 创建 seed cycle；重新评估旧 root。
- dispose：置 `disposed = true`，清除所有 cycle timer，清空 `cycles`、`sessionMeta`、`runningState`、`pendingBySession`、`unattributedRunning`、`unattributedPending`、`announcedPending`、`subagentSessions` 等聚合状态；关闭 live notifications 与 test notifications；取消 list/pending 订阅。dispose 后任何 handler/timer 回调必须立即返回，不得再通知。

### 11. 降级与错误处理

1. 所有事件 handler、快照读取、timer 回调都必须 try/catch；记录 `console.warn`，不让异常逃出到 DSH 事件总线。
2. 列表快照缺失/抛异常/形状不可读：不标记基线就绪，不排静默 timer；已有 cycle 保持 Active，不投递。不要用私有字段兜底。
3. `ctx.uiSession` 缺失：不阻断 pending，完成判定只基于 running；与现有降级一致。
4. `ctx.sessions.list.subscribe` 缺失：只做一次基线 seed；后续依赖 status/added/removed，不假装有实时列表。
5. 元数据缺失：进入未归属全局阻断，不猜测归属；元数据到达或观察消失后解除。
6. 孤儿/环：排除在完成判定之外；不创建 cycle，不阻止 root。
7. timer 回调异常：清 timer、记录警告、保持 Active、不投递；下一次事件或评估可以重试。
8. 配置/前台/Notification 异常：沿用现有防御式行为；cycle 已消费则不重试。
9. 不要为了“保证有通知”而降级到旧的 per-session 立即完成；错误方向上宁可静默，也不能提前误报。

### 12. 配置与 ADR 约束

- **配置**：不新增字段，不改宿主半 Config，不改设置页字段/摘要/滚动位置。继续只有四类开关、`soundPolicy`、`redact`、`showSessionTitle`、`replaceBySession`。
- **四类开关**：`notifyOnComplete` 继续只控制完成通知的投递，不控制 cycle 的维护；其他三类开关与触发逻辑不变。
- **通知通道**：继续只在客户端半用浏览器 `Notification` 投递（ADR 0001）；不新增 Host 半、Remote、原生 helper、服务端兜底。
- **手写客户端**：继续保持 `window.__ModuleLoader__.load` 经典脚本，不引入打包器、不写 JSX、不 require baseline 之外的模块（ADR 0002）。新增逻辑只使用浏览器 baseline 的 `Map`、`Set`、`Date`、`setTimeout`、`clearTimeout`、`console` 等。
- **pending 来源**：继续使用 `ctx.uiSession.sessionStatus`，不订阅 `user-questions/request`/`approval/request` waterfall（ADR 0003）。
- **不新增依赖**：不新增 npm 依赖，不改 `engines`，不改构建脚本。
- **不新增文案**：不新增 locale key；完成正文保持现有“已完成”/“Completed”文案。

### 13. 边界情形表

| 情形 | 期望行为 |
|---|---|
| 根会话单独完成 | 2000ms 后一条完成通知，耗时从根 `running=true` 到静默起点 |
| 根会话结束、子会话仍 running | 不通知；子会话结束且 2000ms 静默后才通知 |
| 子会话结算唤醒根会话 | 根会话再次 `true` 取消 timer；最终只一条 |
| 孙会话/任意深度后代 | 同样参与 busy；深度守卫只防环，不截断正常树 |
| teammate | 与 subagent 同源，按 `origin='subagent'` 子会话处理；不单独通知 |
| 子会话单独被唤醒、根会话 idle | 不新建 cycle；若根会话始终 idle 则不通知；若子会话结算唤醒根会话，则根会话自己的 `running=true` 按新周期处理 |
| 子会话在已有 cycle 内被唤醒 | 取消 timer、阻止完成；结束后重排 2000ms |
| 根会话挂载时已 running | 创建 seed cycle；后续完成可通知，无耗时 |
| 根会话挂载时 idle | 不创建 cycle；不因初始 idle 补发 |
| 挂载时子会话 running、根会话 idle | 不创建 cycle；不通知 |
| 页面刷新 | 同挂载 seed；不补发历史完成 |
| 运行中新子会话出现 | 取消 timer；按 busy 处理 |
| 子会话被移除 | 重新评估 root；若因此静默则 2000ms 后通知 |
| 根会话被移除 | 取消 cycle；不通知；关闭该 root 通知 |
| 根/子 pending 出现 | 阻断完成；取消 timer |
| 根会话 pending 但没有 cycle | 不新建 cycle；pending 清除后不补发完成；根会话随后 running 才开新周期 |
| pending 清除 | 重新评估；2000ms 后通知 |
| 未归属 running/pending | 全局阻断所有 root 的完成，直到元数据到达或观察消失 |
| 孤儿 running/pending | 不阻止任何 root；不创建 cycle；不通知 |
| parent 链成环/超 64 层 | 按 orphan 处理，不死循环 |
| 元数据从 child 变为 root 或反向 | 重新解析所有归属；取消不再成立的 cycle；评估新旧 root |
| external subagent | 没有本地 Session/status，不可观察；不等待，不阻断 |
| 后台 job 仍在跑 | 不纳入完成判定；Agent idle 即可通知 |
| 根会话错误 | 现有错误通知；不取消 cycle；之后仍可能完成通知（现有行为） |
| 子会话错误 | 现有过滤，不通知；不改变 cycle；之后仍可能完成 |
| 取消/中断 | 只有 idle/running，不区分原因；会显示完成（现有行为） |
| 多 root | 每个 root 独立 cycle/timer/通知 key |
| 前台 | 投递时抑制；cycle 消费，不重放 |
| `notifyOnComplete=false` | 投递时抑制；cycle 消费，不重放 |
| `replaceBySession=false` | 每周期仍最多一条，但旧通知不被关闭 |
| 重复 status/added/pending | 不重排 timer，不重复通知 |
| timer 到期重读发现 busy | 不通知；回 Active；下一次静默重新 2000ms |
| timer 到期重读发现 root 移除 | 取消；不通知 |
| timer 到期重读纠正出新的静默转移 | 重新 `quietSince` 并再等 2000ms，不立即通知 |
| dispose | 清 timer/状态/订阅；不通知 |
| 列表回退行 `running=false` | 不据此清除 status 观察到的 running；只合并元数据 |
| 标题/projection 缺失 | 根 cwd basename；再不行 app name；不用子会话标题 |
| 耗时未知（seed/added 创建） | 使用无耗时文案 |
| 通知 API 不可用 | 现有静默失败；cycle 消费 |

### 14. 实施顺序

1. **建立归一化元数据与树工具**：合并 added/list 的 parentId、origin、running；实现根解析、后代判定、未归属/孤儿分类；先不改完成投递，只让数据可用。
2. **接入列表基线与订阅**：首次 seed、后续合并、元数据变化重算；确保初始化不排 timer、不投递。
3. **引入 cycle 状态机与静默 timer**：用 root 周期替代“每个 status false 直接通知”；实现 `startedAt`、`durationKnown`、`quietSince`、取消/重排、到期重读；删除旧的 per-session 完成直发路径。
4. **接入 pending 阻断**：保留现有 announce 逻辑，新增 `pendingBySession` 与未归属全局阻断；任何 pending 变化触发评估。
5. **接入投递适配**：根 facts、无新文案、无耗时分支、`replaceBySession` 替换、前台/配置/声音沿用现有；消费先于投递。
6. **补齐 removed、元数据变化、dispose 与降级**：确保 root 移除不通知、child 移除重评、dispose 清 timer、列表/pending 缺失不崩溃。
7. **扩展 harness 并补测试**：只加 `sessions.list.subscribe` 与可控 timer；更新现有完成用例；新增聚合验收矩阵。
8. **真机验收**：按 Further Notes 的清单验证静默窗口、子会话 pending 可见性、teammate、多 root、刷新/中途挂载和通知替换。

每一步的完成标准是：该步新增的外部行为测试通过，且前一步的测试不回归。不要在中间步骤引入只对测试生效的开关或分支。

## Testing Decisions

### 1. 测试原则

- **只测外部行为**：测试通过 `apply(ctx)` 驱动，使用转发事件、`ctx.sessions.list` 快照、`ctx.uiSession.sessionStatus` 和 `FakeNotification` 观察结果；不读聚合内部 Map、不读 timer 队列、不断言函数名或私有字段。
- **不新增生产测试接口**：不导出状态、不加 debug 方法、不加测试专用分支。harness 可以替身，但生产代码不知道测试存在。
- **确定性时间**：所有 2000ms 等待使用 harness 的可控 timer；测试不得真实 sleep。测试通过 `advance` 推进时间并执行到期回调，通过 `setNow` 设置耗时基准。
- **外部事件顺序可读**：每个用例按“建 harness → 发事件/改快照 → 推进时间 → 断言通知数组”的顺序写，失败时能直接从通知数量、title、body、silent、closed 看出原因。
- **覆盖模块而非实现细节**：验收矩阵覆盖根/子树、静默窗口、pending、生命周期、投递配置、非回归六组行为。

### 2. Harness 扩展

只扩展两处，且都保持在 `tests/helpers/client-harness.mjs`：

1. **`sessions.list.subscribe`**
   - 在现有 `sessions.list` 对象上增加 `subscribe(listener)`，返回取消函数。
   - 现有 `setSummaries(next)` 在更新 `state.summaries` 后通知所有 listener；listener 抛错时捕获，不影响其他 listener。
   - `getSnapshot` 形状保持 `{ ids, byId, phase: 'ready', projectionsBySession }`，不新增生产需要的字段。
   - 为覆盖合成回退行，harness 可用可选测试 fixture 单独指定 `ids`，并通过 `setSummaries` 的可选参数驱动；未指定时仍默认使用全部 summary key，保持现有用例不变。
   - `setProjections` 不需要通知列表订阅者；title 在投递时读取即可。
2. **可控 timer**
   - 用测试内的虚拟队列替换 sandbox 的 `setTimeout`/`clearTimeout`；`Date.now` 继续读 `sandbox.__now`。
   - `advance(ms)` 推进 `__now`，按到期时间顺序执行回调；回调内新排的 timer 若也在推进窗口内，继续执行；设置迭代上限防止死循环。
   - `setNow(value)` 只设置时钟，不自动执行 timer；需要执行到期 timer 时显式调用 `advance(0)` 或 `advance(...)`。
   - `createHarness` 暴露 `advance(ms)`；现有 `setNow` 保留。
   - 不真实等待，不引入第三个 timer 库。

其余 harness 行为保持不变：`FakeNotification`、`session`、`wireSession`、`upsertPending`、`clearPending`、`setSessionStatus`、`dispose`、`focusDocument` 继续使用。

### 3. 覆盖模块与现有 prior art

| 行为域 | 现有 prior art | 本期处理 |
|---|---|---|
| 完成文案、耗时、标题、前台、开关、替换、点击、teardown | `tests/notifications.test.mjs` | 更新完成相关用例以适配 2000ms 与“无周期不通知”；其余保持 |
| pending 去重、清除、优先级、挂载、子会话过滤 | `tests/pending-interactions.test.mjs` | 现有用例保持；阻断完成的新用例放到聚合测试模块 |
| 设置页 8 字段、摘要、测试按钮、权限状态 | `tests/settings.test.mjs` | 不改，作为非回归 |
| 经典脚本契约、baseline require 白名单 | `tests/build.test.mjs` | 不改；新增逻辑不得引入非 baseline require |
| 根/子树聚合、静默窗口、重读、未归属/孤儿、removed、dispose | 无 | 新增 `tests/all-agents-completion.test.mjs`，复用同一 harness |
| 现有四类触发与子会话过滤 | `tests/notifications.test.mjs`、`tests/pending-interactions.test.mjs` | 全部保留，作为非回归 |

### 4. 既有测试的预期变更

- `final completion notifies with elapsed time and project basename`：根 `true` 后 `setNow(+5s)`，根 `false` 后需要 `advance(2000)` 才断言通知；body 仍为 `已完成 · 5 秒 · project-root`（耗时按 `quietSince - startedAt`，不把 2 秒窗口算进去）。
- `completion without an observed start omits the duration but still notifies`：**语义被本规格取代**。没有根 `running=true` 就没有 cycle，单独一个 `false` 不再通知；该用例改为“无周期 false 不通知”，或者删除并由聚合套件的“seed running root 完成后无耗时通知”替代。
- `foreground suppression applies to all four triggers` 的 complete 分支：根 `true/false` 后必须 `advance(2000)` 再断言 0，否则只能证明 timer 未到期，不能证明前台抑制。
- `sound policy matrix` 的 complete 分支：同上，先推进 2000ms。
- `each trigger switch independently disables its notification` 的 complete 分支：同上。
- `plugin teardown closes every live notification`：保留 error 用例；聚合套件新增“dispose 取消静默 timer，advance 后不通知”。
- 子会话过滤、pending 去重/清除、错误文案、替换、标题 fallback、点击等用例不变。
- `tests/settings.test.mjs`、`tests/build.test.mjs` 不改；若它们失败，说明本次改动越界。

### 5. 验收矩阵

以下矩阵全部通过外部行为断言；“advance”指 harness 的可控 timer 推进。

#### A. 根会话与子树

| ID | 场景 | 驱动 | 期望 |
|---|---|---|---|
| A1 | 根会话单独完成 | root true；setNow +5s；root false；advance(2000) | 1 条；title/root；body `已完成 · 5 秒 · project-root`；silent true |
| A2 | 子会话阻断完成 | root true；kid true；root false；advance(5000) | 0；kid false；advance(1999) 仍 0；advance(1) 后 1；耗时到 kid false 为止 |
| A3 | 子结算唤醒父，不双弹 | root true；kid true；root false；kid false；root true；root false；advance(2000) | 中间 0；最终恰好 1 |
| A4 | 孙会话阻断 | root/kid/grand true；root/kid false；grand true；advance(5000) | 0；grand false；advance(2000) 后 1 |
| A5 | teammate 与多子会话 | root true；两个 origin=subagent 子会话；一个先 false、一个仍 true；advance | 0；两个都 false 后 advance(2000) 后 1；子会话不单独通知 |
| A6 | 子会话单独唤醒 | root idle；kid true；kid false；advance(10000) | 0；不新建周期 |
| A7 | 周期内子会话唤醒 | root true；root false；kid true（静默窗口内）；advance | 0；kid false 后 advance(2000) 后 1 |
| A8 | 多 root 独立 | A/B 各自 root+child；A 先完成；B 仍 busy；B 后完成 | A 一条；B 暂 0；B 完成后第二条；互不覆盖 |
| A9 | 每周期一条 + 替换 | root true/false；advance(2000)；advance(10000)；root true/false；advance(2000) | 第一次 1；长时间后仍 1；第二次 2；第一条 closed，第二条存活 |
| A10 | 耗时跨子等待但不含窗口 | root true t0；kid true；root false t1；kid false t2；advance(2000) | body 耗时为 t2-t0，不是 t2+2s-t0 |
| A11 | 重复事件不重复 | root true 两次；root false 两次；advance(2000) | 1 条 |
| A12 | 无周期 false 不通知 | root false（从未 root true）；advance(10000) | 0 |
| A13 | 挂载时根已运行 | list root running=true；root false；advance(2000) | 1 条；无耗时（`已完成 · project-root`） |
| A14 | 标题/项目来自 root | root title/cwd 与 kid 不同；完成 | title 为 root；项目为 root basename；不含 kid 标题 |
| A15 | 根标题缺失不取子标题 | root 无 title、kid 有 title；完成 | 回退 root cwd basename 或 app name；不得用 kid title |

#### B. 静默窗口

| ID | 场景 | 驱动 | 期望 |
|---|---|---|---|
| B1 | 窗口精确 2000ms | root true/false；advance(1999) | 0；再 advance(1) 后 1 |
| B2 | 窗口内子会话 running | root true/false；advance(1000)；kid true；advance(5000) | 0；kid false；advance(2000) 后 1 |
| B3 | 窗口内新增 running 子会话 | root true/false；added kid running=true；advance(5000) | 0；kid false；advance(2000) 后 1 |
| B4 | 列表更新出现 running 子会话 | root true/false；setSummaries 加 kid running=true；advance(5000) | 0；kid false；advance(2000) 后 1 |
| B5 | 窗口内 pending 出现 | root true/false；upsert kid pending；advance(5000) | 0；clearPending；advance(2000) 后 1 |
| B6 | pending 清除后重排完整窗口 | root true/false；kid pending；advance(1000)；clear；advance(1999) | 0；再 advance(1) 后 1 |
| B7 | 重复 false 不延长窗口 | root true/false；advance(1000)；root false 重复；advance(1000) | 从第一次静默起满 2000ms 时 1 |
| B8 | 到期重读发现 root running | root true/false；advance(1000)；list root running=true；advance(1000) | 0；root false；advance(2000) 后 1 |
| B9 | dispose 取消 timer | root true/false；advance(1000)；dispose；advance(10000) | 0；不崩溃 |
| B10 | 前台在到期时抑制且不重放 | focus true；root true/false；advance(2000) | 0；focus false；advance(10000) 仍 0；新 root 周期后 1 |
| B11 | 合成回退行不清除运行状态 | root/kid 经 status 进入 running；root false；列表只把 root 放入 ids，kid 仅以 byId 回退行存在且 running=false；advance(2000) | 不通知；kid 的真实 status=false 后再 advance(2000) 才通知 |

#### C. 待处理交互

| ID | 场景 | 驱动 | 期望 |
|---|---|---|---|
| C1 | 根 pending 阻断 | root true；root pending；root false；advance(5000) | 0；clear；advance(2000) 后 1 |
| C2 | 子 pending 阻断且不通知 | root true；kid true；kid pending；root/kid false；advance(5000) | 0；无子会话通知；clear；advance(2000) 后 1 |
| C3 | 挂载时子 pending | 初始 root running + kid pending；root false；advance(5000) | 0；无子会话通知；clear；advance(2000) 后 1 |
| C4 | 其他 root 的 pending 不影响本 root | A active；B pending；A 完成 | A 1 条；B 仍 0 |
| C5 | 缺失 uiSession | `uiSessionAvailable:false`；root true/false；advance(2000) | 1 条（不因 pending 缺失而卡住） |
| C6 | 未归属 pending 暂阻断 | root active；pending unknown；root false；advance(5000) | 0；added unknown 为 root 的 child；仍 0；clear；advance(2000) 后 1 |
| C7 | plan-review 也阻断 | kid plan-review；同 C2 | 无子通知；阻断；clear 后 1 |

#### D. 生命周期

| ID | 场景 | 驱动 | 期望 |
|---|---|---|---|
| D1 | 挂载全 idle | list 全部 idle；advance(10000) | 0 |
| D2 | 挂载 root+kid 都 running | list 两者 running；root false；advance(5000) | 0；kid false；advance(2000) 后 1 |
| D3 | status 先于元数据 | status root true（无元数据）；setSummaries root running=true；root false；advance(2000) | 1；不重复 |
| D4 | 子 status 先于 added | root active；status kid true（无元数据）；added kid subagent parent=root；root false；advance | 0；kid false；advance(2000) 后 1 |
| D5 | 移除运行中子会话 | root active；kid running；root false；advance(5000) | 0；removed kid；advance(2000) 后 1 |
| D6 | 移除 root | root active；removed root；advance(10000) | 0；该 root 的 live 通知被关闭 |
| D7 | dispose 活跃周期 | root true；dispose；advance(10000) | 0；不崩溃 |
| D8 | 实时列表刷新/重连 | root active；setSummaries root running=false；advance(2000) | 1；不当作 mount seed 而丢弃 |
| D9 | 孤儿 running 不阻断 | root active；added orphan running=true；root false；advance(2000) | 1；孤儿不单独通知 |
| D10 | 未归属 running 解析为另一 root | A active；unknown running 阻断；added unknown 为 root B running；advance(2000) | A 1 条；B 仍 0；B false 后 advance(2000) 为 B 1 条 |

#### E. 投递、配置与非回归

| ID | 场景 | 驱动 | 期望 |
|---|---|---|---|
| E1 | 完成开关关闭/开启 | notifyOnComplete=false；root true/false；advance(2000) | 0；重新开启后新周期 advance(2000) 为 1 |
| E2 | 前台抑制不重放 | 同 B10 | 0；失去焦点后仍 0；新周期才 1 |
| E3 | 隐藏会话标题 | showSessionTitle=false；完成 | title=app name；project=root basename |
| E4 | 关闭同会话替换 | replaceBySession=false；两个完整周期 | 2 条都存活；每周期仍最多 1 |
| E5 | 声音策略 | smart/all/none 下完成 | smart silent；all 不 silent；none silent |
| E6 | 英文 locale | locale=en；完成 | body 以 `Completed` 开头；无新 key 缺失 |
| E7 | 点击通知 | 完成后调用 onclick | `window.focus` 被调用；通知 closed |
| E8 | 投递时读取配置 | root true/false；advance(1000)；关闭 notifyOnComplete；advance(1000) | 0；新周期开启后 1 |
| E9 | 根错误 + 完成（现有行为） | root error；root true/false；advance(2000) | 错误通知 1 条；完成通知 1 条；不新增失败语义 |
| E10 | 子错误过滤且不阻断 | root active；kid error；root false；advance(2000) | 无子错误通知；完成 1 条 |
| E11 | 子 question/approval 过滤 | kid question/approval；完成前后 | 无子通知；pending 阻断；clear 后完成 1 条 |
| E12 | 不新增文案/计数 | 任意完成 | body 仅为现有 `已完成`/`Completed` 加项目/耗时；不出现“全部”或智能体数量 |

### 6. 完成定义

- 新增聚合测试模块与更新后的现有测试全部通过；`npm test`（含 build 与 `node --test`）通过。
- `tests/settings.test.mjs`、`tests/build.test.mjs` 无改动且通过。
- 生产代码没有新增导出、测试专用接口、配置字段、locale key 或非 baseline require。
- 真机清单（Further Notes）全部通过；至少完成一次本地 subagent、一次 teammate、一次任意深度后代、一次子会话 pending、一次多 root、一次刷新/中途挂载、一次前台抑制和一次通知替换验证。
- 代码改动范围只落在客户端半、harness 与测试；宿主半、设置页、构建脚本、ADR 不改。

## Out of Scope

1. **external subagent**：没有本地 Session/status，客户端不可观察；不等待、不阻断、不承诺覆盖。使用 ACP/Codex/Claude Code 等外部 provider 的 external 子代理可能仍在运行时收到完成通知。
2. **后台 job**：不接入 `ctx.jobs`，不按 job owner 过滤，不把 job 运行当作 busy；Agent idle 即可通知，即使 job 仍在跑。
3. **失败与取消的区分**：不读 `turn/end.reason`，不新增失败标记、失败文案、失败抑制或“部分完成”语义；根错误后仍按现有行为可能再发完成通知。
4. **子会话提问/审批/错误通知的调整**：不新增“子智能体需要你”通知，不改变 `isSubagent` 过滤，不改变现有文案；子会话 pending 只阻断完成，可能造成“完成被阻断但用户没有子会话通知”的已知限制。
5. **新配置与新 UI**：不新增静默时长、根/树范围、等待子代理开关；不改设置页字段、摘要、提示文案；不新增 locale key。
6. **Host 半精确等待**：不使用 `waitForChildren`、`agent.whenIdle()`、自定义 Remote、RPC 或原生 helper；不把通知移回宿主半。
7. **持久化与回填**：不在 App 关闭、页面未打开、断线期间补发完成；页面刷新只 seed，不补历史。
8. **M2 点击导航**：点击仍只聚焦窗口，不跳转到具体会话；只保留 root sessionId。
9. **多 owner/远程访问下的列表完整性**：不保证非 owner 或远程策略下 `ctx.sessions.list` 包含全部子会话；桌面单 owner 是目标场景。
10. **tree-anchored 模式**：不实现“子会话单独唤醒也新建周期”的变体；本期固定 root-anchored。
11. **Agent Teams 专用协议**：不读 team roster/phase 作为完成信号；teammate 只按 subagent 子会话处理。
12. **性能优化/遥测**：不加缓存层、指标、日志采样或遥测；只做必要的防御式读取。
13. **其他文档修订**：本任务只写本规格；ADR 0001、M1 规格、README、CONTEXT 的措辞修订留给后续独立文档任务。

## Further Notes

### 1. 依赖的当前 DSH 公开实现面

本规格依赖以下公开面；它们来自当前 DSH 版本，不是第三方插件的 semver ABI：

- 转发事件 `api-session/status`：per-session running，子会话同样发出。
- 转发事件 `api-session/added` / `api-session/removed`：用于建立/清理父子关系与 running 基线。
- 转发事件 `api-session/error`：现有错误通知；本期不用于完成判定。
- `ctx.sessions.list`：公开客户端 store，快照至少包含 `ids`、`byId`、行的 `id`、`running`、`parentId`、`origin`、`cwd`，以及 `projectionsBySession[id].values.title`；`ids` 成员关系用于区分 Host 列表行和仅合成到 `byId` 的回退行。
- `ctx.uiSession.sessionStatus`：公开 `Map<SessionId, { running, pendingInteraction, completionUnread }>`；本期只用 `pendingInteraction`。
- `ctx.configForms` / `ctx.locale` / `ctx.slots` / 浏览器 `Notification`：现有配置、文案、设置页与投递通道。

明确不依赖：raw `agent/status`、raw `agent/error`、`subagent/*` 事件、`subagentCatalog` 的执行状态、`subagentTiming`、`agentTeam` roster 的 phase、`waitForChildren`、`listDescendants`、`workspace/session-activity`、任何私有 projection 或内部字段。

ADR 0001 中“子智能体完成通知不做”的结论，应理解为“不基于 raw subagent/* 事件做”；本规格通过 per-session `api-session/status` 聚合，不新增通知通道，不改变“只在客户端半投递”的决策。后续可用新的 ADR 记录这次范围扩展。

### 2. engines 与兼容范围

- `engines.dsh`：`>=0.2.1-rc.1 <0.3.0-0`。
- `engines.node`：`^22.19.0 || >=24`。
- 当前验证目标：本机桌面版 0.2.1-rc.2。
- 不修改 `engines`、构建脚本或依赖。DSH 升级超出该范围时，必须重新跑真机验收矩阵；若 `ctx.sessions.list` 行形状、`sessionStatus` 形状或转发事件变化，按防御式读取降级，不得改用私有 API 或 Host-only 方法。

### 3. 真机验证清单

以下项目必须在真实 macOS 桌面版、真实通知通道上验证；自动化测试只覆盖 harness 层。

1. **静默窗口时序**：启动一个本地 subagent，让子会话结束并触发父会话 settlement notice；记录“子 false → 父 true → 父 false”的间隔。确认 2000ms 窗口内不会提前通知，最终只有一条完成通知。对 teammate 重复一次。
2. **双弹回归**：确认父会话被 settlement notice 唤醒再结束后，不会出现“子完成一条 + 父完成一条”。若出现双弹，优先检查 timer 取消、重复事件和 `quietSince`，不要通过改配置或延长窗口掩盖。
3. **任意深度**：构造 root → child → grandchild，确认 grandchild running 时根不通知，grandchild 结束后 2000ms 才通知。
4. **子会话 pending 可见性**：让子会话发起 question 和 approval（分别在根 running 与根 idle 时），确认父窗口的 `ctx.uiSession.sessionStatus` 中能看到该子会话的 `pendingInteraction`；确认 pending 存续期间没有完成通知，回答/审批后 2000ms 才通知。若真机看不到子会话 pending，则本规格的“子 pending 阻断”在该版本上不成立，必须记录为已知限制并停止宣称覆盖；不得改用 waterfall 兜底（ADR 0003）。
5. **列表完整性**：确认 `ctx.sessions.list` 在刷新后仍包含 root、subagent、teammate、grandchild 的行，且 `parentId`/`origin`/`running` 正确；确认 retained fallback 行不会被误当成 false running。
6. **挂载/刷新**：页面在 root running 时刷新，确认后续完成仍通知；页面在全 idle 时刷新，确认不会补发历史完成；页面在只有 child running 时刷新，确认不会新建周期。
7. **多 root**：同时跑两个 root，各自带子会话，确认完成通知互不覆盖、各自最多一条、按 root 替换。
8. **前台与配置**：前台时完成不通知，切到后台后不重放；`notifyOnComplete` 关闭时不通知，重新开启后新周期可通知；`replaceBySession=false` 时旧通知保留。
9. **移除**：在 root 已 idle、child 仍 running 时移除 child，确认 2000ms 后 root 完成通知出现；移除 root 时不出现完成通知。
10. **通知身份**：确认通知仍由 DeepSeek Harness 身份投递，点击聚焦窗口；不出现第二次授权或身份漂移。
11. **App 关闭/页面未打开**：确认没有任何通知；这是 ADR 0001 的既有取舍，不在本期修复。

### 4. 已知限制与风险

- **external subagent**：客户端不可观察；完成可能早于外部子代理实际结束。不得用 catalog 的 external 成员猜测运行状态。
- **后台 job**：Agent idle 不等于 job 结束；完成通知可能在 job 仍在跑时出现。这是本期明确不纳入的范围。
- **失败/取消**：只有 idle/running，没有原因；失败或取消后仍可能显示“已完成”。本期不新增语义。
- **子会话 pending 静默**：子会话 pending 会阻止完成，但其 question/approval 通知仍被现有过滤；如果用户在根窗口看不到子会话的等待卡片，可能出现“完成一直不来但不知道为什么”。这是本期保留的 UX 限制，后续应单独设计“子智能体需要你”的通知。
- **未归属会话**：running/pending 但没有任何元数据时会全局阻断完成，直到元数据到达或观察消失；这是为了不提前误报而选择的保守策略。
- **孤儿/环**：父链缺失、成环或超过 64 层时不参与任何 root 的完成判定；如果 DSH 的 parent 元数据异常，可能漏掉实际仍在运行的后代。
- **removed 事件丢失**：列表快照缺失行不删除，若 removed 事件丢失，缓存的 running/pending 可能延迟完成；不要用列表缺失推断删除。
- **列表回退行**：retained fallback/catalog 行的 `running=false` 不作为停止信号；如果该会话的 status false 事件也丢失，可能延迟完成。
- **公开面稳定性**：`ctx.sessions.list`、`sessionStatus`、`api-session/status` 是当前公开实现面，不是第三方 ABI；升级 DSH 必须回归本规格。
- **静默窗口固定 2000ms**：这是产品决策，不暴露配置。真机若出现双弹，先修状态机/取消逻辑；若确需调整常量，另立产品决策，不在本期偷偷改成配置。
- **无持久化**：页面刷新、断线、App 关闭期间的完成不会补发；这是 ADR 0001 与本期 seed 规则的共同结果。

### 5. 文档影响

本任务只新增本规格，不修改其他文档。实现落地后，以下既有表述应另行修订，避免读者误解：

- ADR 0001 的“子智能体完成通知不做”应补充“raw subagent/* 不可达；per-session `api-session/status` 可由客户端聚合”。
- M1 规格与 README 的“子智能体会话不发通知”应改为“子会话不单独发通知；完成通知按根会话子树聚合”。
- CONTEXT.md 的“最终完成”可补充“根会话及其可观察本地子树静默”的通知口径。

这些修订不属于本规格的实施范围；本规格不修改 ADR、README、M1 规格或 CONTEXT。


