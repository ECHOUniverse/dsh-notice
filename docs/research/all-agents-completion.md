# dsh-notice：同一会话内“主智能体 + 全部子智能体/teammates 完成”通知调研

- 日期：2026-11-08
- 调研对象：工作区 dsh-notice 0.1.0（当前 src/client.js、tests/、docs/）
- DSH 实现：/Applications/DeepSeek Harness.app/Contents/Resources/app.asar（下称 $ASAR）
- 官方包根：$ASAR/dsh/node_modules/@deepseek-ai（下称 $PKG）
- 报告性质：只做调研与方案设计，未修改任何业务代码

## 结论摘要

1. **当前通知只由“某一个会话的 Agent 进入 idle”触发**：src/client.js:1048-1057 订阅 api-session/status，running 变为 false 就发 complete；这个事件在 Host 侧来自 agent/status，payload 只有该 Agent 的 sessionId 和 running，没有父子树概念（$PKG/dsh-api-session-controller/lib/index.js:3836-3838、$PKG/dsh-api-session-controller/lib/typert.host.js:2924）。
2. **覆盖不了子智能体的根因不是过滤写错，而是判定对象选错**：subagent 工具在子 Agent 发布后立刻返回 childId，父 Agent 继续执行并可先结束自己的 turn（$PKG/dsh-tool-subagent/lib/index.js:464-473、$PKG/dsh-tool-subagent/README.md:170）。因此“父 idle、子 running”是 DSH 的正常中间态；当前代码把父 idle 当成全部完成，而 origin === 'subagent' 过滤只是让子会话不再单独发通知，并没有参与“是否全部完成”的判定（src/client.js:531-533、551）。
3. **DSH 没有公开的“全智能体空闲”信号**。浏览器可用的只有按 session 的 status/list/projection；子 Agent 的 running 通过同一个 api-session/status（sessionId 换成子会话）可见，teammate 也是 subagent-origin 子会话，running 同样来自 Session status（$PKG/dsh-api-session-controller/lib/typert.host.js:222-229、$PKG/dsh-experimental-client-ui-agent-team/lib/client.js:90-92）。但 external subagent 没有本地 Session，客户端看不到它的运行状态（$PKG/dsh-subagent/README.md:123）。
4. **可以用公开客户端服务实现“同一根会话子树全部静默后才通知”的近似方案**：api-session/status + ctx.sessions.list + ctx.uiSession.sessionStatus。关键不是“等所有子 Agent idle”，而是要等**父 Agent 处理完子 Agent 的 settlement notice 后再次 idle**，否则会在子 Agent 刚结束时先发一条、父 Agent 被唤醒后再发一条。推荐“根会话周期 + 静默窗口 + 每周期一次”的状态机（见第 4 节）。
5. **如果要 100% 精确**，DSH 内核有现成算法：ctx.subagents.waitForChildren(parent) 与 agent.whenIdle() 交替检查（$PKG/dsh-subagent/README.md:119、$PKG/dsh-subagent/lib/types/index.js:155-163）。但它只存在于 Host 半，客户端半拿不到；走 Host 半需要自定义 Remote 通道，属于新 API 面，风险明显高于客户端聚合。

---

## 0. 来源约定与本机复现

### 0.1 来源约定

- 本仓库文件用相对路径，如 src/client.js:1048-1057。
- 官方实现用 $PKG/<包名>/<文件>:<行号>；$PKG = $ASAR/dsh/node_modules/@deepseek-ai。
- $ASAR 是 asar 归档，普通 ls 不能进入；本项目 .tmp/asar/ 只是部分解包。本报告引用的官方源码、类型声明、README 均直接读自 $ASAR 内对应文件。
- 行号以当前安装的 DSH 版本为准；不同 DSH 版本可能有偏移，结论以“文件 + 符号”为准。

### 0.2 本机复现

用仓库自带 tests/helpers/client-harness.mjs 加载 src/client.js，构造 root（普通会话）与 kid（origin: subagent、parentId: root）：

1. root status=true
2. kid status=true
3. root status=false
4. kid status=false

实测输出：

    第 3 步后：notifications = 1，body = "已完成 · 10 秒 · project-root"
    第 4 步后：notifications = 1（没有新增）

这直接复现了“主 Agent 完成、子 Agent 仍在跑时提前通知”，也说明子 Agent 完成时不会补发。对应代码是 src/client.js:1048-1057 与 src/client.js:531-533、551。

---

## 1. 当前通知由谁触发，为什么覆盖不了子智能体

### 1.1 触发链

客户端半注入的服务是 remote、sessions、configForms、locale、slots、uiSession（src/client.js:1033）。completion 通知的完整链路：

    浏览器 remote 事件 api-session/status(sessionId, running)
      -> src/client.js:1048-1057
      -> running === true：记录 runStartedAt
      -> running === false：计算 duration，调用 notify(..., 'complete')
      -> notify 在 src/client.js:545-556 做开关、前台、subagent 过滤
      -> showNotification 在 src/client.js:466-474 创建 Notification

Host 侧的来源：

    ctx.on('agent/status', ({ agent, status }) => {
      ctx.emit('api-session/status', agent.id, status === 'running');
    });
    —— $PKG/dsh-api-session-controller/lib/index.js:3836-3838

这个事件被列在转发白名单里，resources 只用于访问控制，不改变 payload：

    { event: 'api-session/status', mode: 'emit', resources: { session: (sessionId) => sessionId } }
    —— $PKG/dsh-api-remotes/lib/types/remote-events.js:16-47（status 在第 23 行）

running 的语义是“该 Agent 的 loop 是否处于非 idle 阶段”：

    get status() {
      return this.phase.kind === 'idle' || this.phase.kind === 'maintenance' ? 'idle' : 'running';
    }
    —— $PKG/dsh-agent-loop/lib/index.js:554-556

AgentStatus 只有两个值：

    export type AgentStatus = 'idle' | 'running';
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:2924

而 SessionSummary.running 就是“这个 session 的 Agent 是否 running”：

    running: this.ctx.agents.get(session.id)?.status === 'running'
    —— $PKG/dsh-api-session-controller/lib/index.js:2733-2745（第 2741 行）

关键点：**api-session/status 是 per-Agent / per-session 的，不是 per-tree 的。** 父 Agent 的 status 只描述父 Agent 自己的 loop；子 Agent 是另一个 Agent、另一个 session，有自己的 status 事件。

### 1.2 为什么“父 idle、子 running”是正常状态

subagent 工具不是同步等待子任务，而是在子 Agent 发布后立即返回 childId：

    return {
      kind: 'activation',
      subagentId: (await ctx.subagents.startActivation({
        provider: config.provider,
        label: args.description,
        request,
        signal: exec.signal,
        delivery: 'parent'
      })).childId
    };
    —— $PKG/dsh-tool-subagent/lib/index.js:464-473

官方 README 明确说明工具“立即返回 child session id”，父级在后台 activation 结算时才收到 completion notice：

    The tool returns a child session id immediately. The parent receives a completion notice when the background activation settles.
    —— $PKG/dsh-subagent/README.md:45

更关键的是官方给模型的指导：**父 Agent 应该结束 turn，而不是 sleep/poll；子 Agent 结算后的 notice 会让 idle 的父 Agent 再起一个 turn**：

    ... instructing the model to start independent delegations together and keep working while they run,
    and to end its turn instead of sleeping or polling when only waiting for their results remains.
    Ending the turn works because a settled child notifies its parent and a notice that reaches
    an idle parent starts one independent model request ...
    —— $PKG/dsh-tool-subagent/README.md:170

所以典型时序是：

    t0  父 Agent 在 turn 内启动子 Agent（tool 立即返回）
    t1  父 Agent 继续做别的事
    t2  父 Agent turn 结束 -> agent/status idle -> api-session/status(root, false)
    t3  子 Agent 仍在 running
    t4  子 Agent 结束 -> settlement notice -> 父 Agent 可能被唤醒 -> api-session/status(root, true)
    t5  父 Agent 处理完 -> 再次 idle -> api-session/status(root, false)

当前插件在 t2 就发通知，因为 t2 的 root 事件本身没有携带“还有子 Agent 在跑”的信息；而子 Agent 的 t4 事件被 isSubagent 过滤掉（src/client.js:531-533、551）。这就是“主完成、子未完成也通知”的完整原因。

### 1.3 origin === 'subagent' 过滤的两面性

当前过滤的意图是“子会话不要单独发通知”，实现是：

    function isSubagent(sessionId, facts) {
      if (subagentSessions.has(sessionId)) return true;
      return facts.summary !== undefined && facts.summary.origin === 'subagent';
    }
    —— src/client.js:531-533

    notify(...) {
      ...
      if (isSubagent(sessionId, facts)) return;
      ...
    }
    —— src/client.js:545-556

它解决的是“子会话不要单独弹”的问题，但带来两个后果：

- **completion 判定没有子树**：notify 之前没有任何“这个 root 还有没有 running 后代”的检查。
- **子会话的 question / approval / error 也一起被静默**：因为 isSubagent 对所有 kind 生效，不只是 complete。这个副作用在“全智能体完成”场景下会变得严重（见 4.8 的 pending interaction / failure 行）。

### 1.4 现有 ADR 的边界，以及为什么现在可以重新评估

docs/adr/0001-notification-channel.md:36 的结论是：

    客户端半只能订阅 26 个转发事件白名单：用 api-session/status 判“最终完成” ...
    agent/status、agent/error、subagent/* 不可达，因此「子智能体完成通知」不做。

这段话在“raw agent/status、agent/error、subagent/* 事件”层面是正确的，但它没有否定另一条路径：**api-session/status 本身就是 agent/status 在 session 维度上的转发投影，它对子 Agent 同样会发出**。证据：

- Host 的 agent/status 监听没有任何 origin 过滤（$PKG/dsh-api-session-controller/lib/index.js:3836-3838）。
- 转发白名单只按 sessionId 做访问控制，不按 origin 丢弃（$PKG/dsh-api-remotes/lib/types/remote-events.js:23）。
- 官方子智能体 UI 正是用 Session status 给子会话计算 running：$PKG/dsh-client-ui-subagent/lib/client.js:370、393。
- 官方 Agent Teams UI 也明确用 Session status 给 teammate 计算 running：$PKG/dsh-experimental-client-ui-agent-team/lib/client.js:90-92，README.md:34。

因此本报告不是推翻 ADR 0001 的“通知只能从客户端半发”结论，而是在它之上补一条 ADR 当时未展开的事实：**子会话的 per-session status 是客户端可达的，只是没有聚合**。

---

## 2. DSH 对 subagent / teammate 暴露了什么公开客户端能力

### 2.1 转发到浏览器的会话事件

| 事件 | payload | 语义 | 对子树聚合的用处 |
|---|---|---|---|
| api-session/status | (sessionId, running) | 某个 Agent 进入/离开 running | 主信号；子会话也会发 |
| api-session/added | SessionSummary | session 建立；agent created/disposed 时也会重发可用性 | 学习 parentSessionId / origin / running |
| api-session/removed | (sessionId) | session 被销毁 | 清理子树 |
| api-session/error | (sessionId, message) | agent/error 的字符串 | 标记失败，抑制/改写完成 |
| api-session/activity | (sessionId, time) | 用户消息活动 | 与完成判定无关 |

来源：$PKG/dsh-api-remotes/lib/types/remote-events.js:16-47；added/removed 的 Host 发射在 $PKG/dsh-api-session-controller/lib/index.js:3825-3835；error 在 3839-3841。

没有 subagent 专用事件，也没有 team 专用事件。ADR 0001 的“subagent/* 不可达”在 raw 事件层面仍然成立。

### 2.2 SessionSummary：父子关系与 running 的权威形状

    export interface SessionSummary {
      readonly agentAvailable: boolean;
      readonly formatStatus?: 'current' | 'migration-required';
      readonly sessionId: SessionId;
      readonly updatedAt: number;
      readonly running: boolean;
      readonly blank: boolean;
      readonly parentSessionId?: SessionId;
      readonly origin?: 'subagent';
      readonly cwd?: string;
      readonly projections?: SessionProjectionHints;
    }
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:3819-3821

SessionSummary 同时给出：
- running：该 session 的 Agent 是否 running（Host 计算，见 1.1）。
- parentSessionId：直接父会话。
- origin：subagent 表示子会话。

Host 的 session/list 返回“每个逻辑 session”（$PKG/dsh-session-query/README.md:34），listFields 会把 parentSession 和 origin 带进 summary（$PKG/dsh-api-session-controller/lib/index.js:2922-2927）。客户端 flattenLineage 正是用 origin === 'subagent' 和 parentSessionId 建立缩进树（$PKG/dsh-api-session-controller/lib/types/client/sessions/lineage.js:11-27），并且对“父不在列表里的孤儿”降级为 root，而不是丢弃（lineage.js:25）。

结论：**浏览器拿得到完整的 parentSessionId/origin/running 三元组，前提是 Host list 基线或 api-session/added 到达。**

### 2.3 客户端 Session 列表与状态源

（1）ctx.sessions.list

客户端 Session 列表 store 的每一行至少包含：

    byId[sessionId] = {
      id,
      displayTitle,
      running,
      retainedBy,
      blank,
      updatedAt,
      formatStatus,
      projectionValues?,
      title?,
      cwd?,
      parentId?,     // 来自 summary.parentSessionId
      origin?        // 来自 summary.origin
    }
    —— $PKG/dsh-api-session-controller/lib/client.js:4162-4182

它由 Host list + status/added/removed 的 mutation 维护；官方 ui-session 也用 ctx.sessions.list.subscribe 跟踪列表变化（$PKG/dsh-client-ui-session/lib/client.js:808-813、966）。

（2）ctx.uiSession.sessionStatus

    sessionStatus = {
      getSnapshot: () => this.statusSnapshot,
      subscribe: (listener) => { ... }
    }
    —— $PKG/dsh-client-ui-session/lib/client.js:782-790

每个 session 的状态形状：

    Map<SessionId, {
      running: boolean | undefined,
      pendingInteraction: SessionPendingInteraction | undefined,
      completionUnread: boolean
    }>
    —— $PKG/dsh-client-ui-session/lib/client.js:992-1007

官方 README 的关键限定：

    Running status comes from Host list baselines or status events. Subagent catalog rows and
    retained subagent fallback rows do not establish running status ...
    —— $PKG/dsh-client-ui-session/README.md:13

也就是说：catalog 行本身不能证明子会话 running；running 必须来自 Host list 基线或 status 事件。这正好支持第 4 节“以 status 事件为主、list 为基线”的设计。

（3）官方 UI 的用法

- 子智能体目录：activity 由 statuses.get(entry.id)?.running 与 summaries[entry.id]?.running 合并得出（$PKG/dsh-client-ui-subagent/lib/client.js:357-372），running count 也由此计算（同文件 393）。
- Teams roster：member.phase === 'active' 时，running 取 useSessionStatus 的值，回退到列表摘要（$PKG/dsh-experimental-client-ui-agent-team/lib/client.js:90-92）。

### 2.4 可读投影：目录有成员、时序有 open turn、Teams 有 durable phase，但都没有“统一 running”

（1）subagentCatalog

    subagentCatalog: [
      { id, createdAt, mode: 'one-shot' | 'external' | 'continuable' | 'unknown', label? }
    ]
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:1084-1104

官方 README 明确：

    Catalog entries record membership once at creation and carry no execution status.
    —— $PKG/dsh-subagent/README.md:123

所以 catalog 只能用来发现“有哪些子会话”，不能用来判断“还在不在跑”。

（2）subagentTiming

    subagentTiming?: {
      settledMs: number,
      active?: { since: number, through: number },
      lastTurnCompleted?: boolean
    }
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:1105-1112

它描述“当前是否有未闭合的 turn”和“最近闭合 turn 是否正常完成”，是子会话的**日志投影**，不是 live Agent 状态；需要加载 projection 才有，不能替代 status 事件。

（3）agentTeam

    agentTeam: {
      members: [{
        id, name, role: 'lead' | 'teammate',
        phase: 'failed' | 'provisioning' | 'active',
        error?
      }],
      tasks, failure?
    }
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:222-243

类型声明直接写明：

    ... phase ... describe('Durable lifecycle; the Lead row is always active.
    Turn activity comes from Session status.')
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:227

官方 README 也说明 roster 的 running/inactive 是 UI 用 live Session status 合出来的（$PKG/dsh-experimental-agent-team/README.md:62；$PKG/dsh-experimental-client-ui-agent-team/README.md:34）。

关键结论：**Teams 没有“team 全部 idle”投影；teammate 的 running 仍然回到 per-session status。**

### 2.5 Remote 端点：只有按 session 的状态/等待，没有子树等待

浏览器可用的相关 Remote：

- session/state：返回 cursor、active、running、queue、pendingInput（$PKG/dsh-api-session-controller/lib/typert.host.js:3812；Remote 注册在 2512）。
- session/wait：等待**一个 session** 进入 idle / input-required / timeout（$PKG/dsh-api-session-controller/lib/typert.host.js:3859-3861；注册在 2577；判定逻辑在 $PKG/dsh-api-session-controller/lib/types/state/controller.js:260-276）。
- subagents/prompt、subagents/interruptByParent：这是 subagent 包对浏览器暴露的全部 Remote（$PKG/dsh-subagent/lib/typert.host.js:63-66、132）。
- 没有 subagents/list、subagents/wait、subagents/status。

session/wait 的判定只覆盖“这个 session 自己”：

    function computeWaitAction(state) {
      if (state.pendingInput.length > 0) return 'input-required';
      if (state.running) return 'continue';
      if (!state.active) return 'idle';
      return 'check-idle';
    }
    —— $PKG/dsh-api-session-controller/lib/types/state/controller.js:260-268

它不会等待后代。因此它不能直接回答“全智能体是否完成”。

### 2.6 仅 Host 半可用的能力（客户端半拿不到）

（1）waitForChildren：DSH 官方的“等后代工作”算法

    async waitForChildren(parent) {
      let observed = false;
      while (true) {
        const pending = [...this.materializations].filter(item => item.lineage.includes(parent));
        const children = [...this.resident.values()].filter(item =>
          activationAgent(item) !== parent && item.ancestry.has(parent));
        observed ||= children.some(item => item.kind === 'local' && item.handle.agent.status !== 'idle');
        await Promise.all(children.flatMap(item =>
          item.kind === 'local' ? [item.handle.agent.whenIdle()] : []));
        ...
        if (item.handle.agent.status !== 'idle') { waits.push(item.handle.agent.whenIdle()); continue; }
        ...
      }
    }
    —— $PKG/dsh-subagent/lib/types/manager.js:190-231

它同时考虑：lineage 尚未发布的 materialization、已经在 resident 的后代、后代自己的 whenIdle、后代 ownedChildren、后代 inbox 是否还有 pending、failureAt。官方 README 给出了宿主端的完整循环：

    Headless hosts repeat agent.whenIdle() and waitForChildren(agent) until no child work remains
    and the parent stays idle with an unchanged Session sequence across the child check ...
    —— $PKG/dsh-subagent/README.md:119

这是最接近“全智能体空闲”的官方实现，但它是 Host 服务方法（$PKG/dsh-subagent/lib/types/index.js:155-163），不在浏览器 Remote 面。

（2）listChildren / listDescendants：Host 函数，不是 Remote

    export async function listChildren(ctx, parentSessionId, signal) { ... }
    export async function listDescendants(ctx, rootSessionId, signal) { ... }
    —— $PKG/dsh-subagent/lib/types/list-children.js:67-90、99-...

它们读取 parent 的 subagentCatalog 投影，返回**成员**，不返回 running（README 123 已说明 catalog 无 status）。它们没有 @Remote 装饰，浏览器不能直接调用。

（3）workspace/session-activity：内核确实有“聚合活动”概念，但只用于归档准入

官方 subagent README：

    workspace/session-activity reports the live subagent descendants inside a turn as the subagent family ...
    —— $PKG/dsh-subagent/README.md:138

    SessionActivityKindMap { turn, job, subagent, schedule }
    —— $PKG/dsh-api-session-controller/lib/typert.host.js:3551-3552

它是 Host waterfall，由 workspace 归档流程调用（$PKG/dsh-workspace/README.md:103），**没有转发到浏览器**。所以不能拿它当完成通知信号；它反而证明了“官方聚合”存在但不在客户端 API 面上。

### 2.7 是否存在直接的“全智能体空闲”信号？

**没有。** 逐项排除：

- api-session/status：per-session，不是 per-tree（1.1）。
- SessionSummary.running：per-session（2.2）。
- subagentCatalog：无 execution status（2.4）。
- subagentTiming：child 自己的时序投影，非 live 聚合（2.4）。
- agentTeam：durable phase，running 要另取 Session status（2.4）。
- session/state、session/wait：单 session（2.5）。
- subagents Remote：只有 prompt/interruptByParent（2.5）。
- waitForChildren / listDescendants / workspace/session-activity：Host-only（2.6）。

因此，客户端只能**自己聚合**。

---

## 3. 能否用公开且稳定的插件 API 实现

### 3.1 三条路线对比

| 路线 | 做法 | 精度 | API 公开性/稳定性 | 风险 |
|---|---|---|---|---|
| A. 客户端聚合（推荐） | api-session/status + ctx.sessions.list + ctx.uiSession.sessionStatus，自建父子树与静默窗口 | 近似；覆盖本地子 Agent、teammate；不覆盖 external subagent；不区分取消原因 | 全是官方客户端服务/事件，插件已经注入 sessions/uiSession/remote | 不是 DSH 内核级精确；服务形状随 DSH 版本变化；需要处理基线/竞态 |
| B. Host 半 + 自定义 Remote | 在 Host 半用 ctx.subagents.waitForChildren(agent) + agent.whenIdle() 精确判定，再通过自定义 Remote/事件通知客户端 | 最接近内核语义 | waitForChildren 是公开 Host 服务（README 明示），但“把结果送到浏览器”需要插件自定义 Remote 通道 | 新 API 面、构建/生成代码、版本兼容、权限/网关配置；远大于“最小改造” |
| C. 读更深的客户端内部状态 | 直接读 projection store / SessionEventStream / 私有字段 | 可提高部分精度（如 turn/end.reason） | 部分是公开 store，部分是内部形状 | 与 DSH 内部实现耦合；projection 未加载时会缺失；升级易碎 |

### 3.2 路线 A 的公开性判断

路线 A 用到的每个东西都在官方包的 README/类型里出现：

- api-session/status 是白名单事件（$PKG/dsh-api-remotes/lib/types/remote-events.js:23）。
- ctx.sessions.list 是 Client Session Controller 的公开 store；官方 ui-session 自己就 subscribe 它（$PKG/dsh-client-ui-session/lib/client.js:808-813）。
- ctx.uiSession.sessionStatus 是官方 ui-session 暴露的根 hook/服务（$PKG/dsh-client-ui-session/README.md:11；$PKG/dsh-client-ui-session/lib/client.js:782-790）。
- dsh-notice 已经注入 sessions 与 uiSession（src/client.js:1033），不需要新增依赖。

但必须说清楚“稳定”的边界：这些是**官方实现中的公开面**，不是 DSH 对第三方插件承诺的 semver ABI。插件应：
- 继续用 engines.dsh 锁定兼容范围（package.json:44-47）。
- 对每个 getSnapshot 做形状防御（现有 sessionFacts 已经是这种风格，src/client.js:506-522）。
- 服务缺失时优雅降级为现有 per-session 行为，而不是崩溃。

### 3.3 路线 B 的具体风险

- waitForChildren 的 parent 参数要求“exact live parent Agent”（$PKG/dsh-subagent/lib/types/index.js:155-163 的 JSDoc），Host 半需要拿到 root agent；这不难，但 Host 半目前只声明 Config，没有任何运行时服务（src/index.ts:66-76）。
- 把结果送到客户端需要新增 Remote 命名空间或自定义事件；DSH 的转发白名单是应用级固定列表（$PKG/dsh-api-remotes/lib/types/remote-events.js:16-47），插件不能往里加 api-session/*。走 Typert 自定义 Remote 是可行方向，但属于新 API 面，且需要生成/维护客户端绑定。
- 通知仍然必须从客户端半发（docs/adr/0001-notification-channel.md:20），所以 Host 半只能“算状态”，不能“发通知”，链路反而更长。
- 因此路线 B 只在“必须精确”且“愿意维护自定义 Remote”时才值得。

### 3.4 路线 C 的具体风险

- subagentCatalog / subagentTiming / agentTeam 都需要 projection 已加载；客户端列表只为“已加载 projection 的 parent”合成子行（$PKG/dsh-api-session-controller/lib/client.js:4184-4209），不能假设任意 root 的 catalog 都可用。
- 直接读 SessionEventStream 拿 turn/end.reason 可以区分取消/失败，但会引入历史流、重连、seq 缺口处理，超出“最小改造”。
- 私有字段没有兼容承诺，升级即碎。

**结论：推荐路线 A。它用公开客户端面解决 90% 的问题；剩余 10%（external subagent、取消原因、后台 job）明确列为限制，不用私有 API 硬凑。**

---

## 4. 推荐方案：根会话子树静默后才发一条完成通知

### 4.1 语义定义

- **根会话（root）**：origin !== 'subagent' 的普通会话。fork 不继承 parentSession（$PKG/dsh-api-session-controller/README.md:67），因此也是 root。
- **子会话（child）**：origin === 'subagent' 且能沿 parentSessionId 走到某个 root 的会话；本地 subagent 与 teammate 都属于这一类（teammate 的创建走 subagents.startActivation 且保留 childId，见 $PKG/dsh-experimental-agent-team/lib/types/roster.js:236-248；child session meta 固定 origin: 'subagent'，见 $PKG/dsh-subagent/lib/types/child-agent.js:107-120）。
- **子树（subtree）**：root 自身 + 所有后代，任意深度（maxDepth 可配置，默认 1）。
- **周期（cycle）**：从子树中第一次观察到 running 开始，到整棵子树“静默”结束。一个周期最多发一条完成通知。
- **静默（quiescent）**：root 不 running；子树内没有 running 的子会话；子树内没有 pendingInteraction；自最后一次 running/pending 变化起已经过 QUIET_MS；并且再读一次权威源仍然如此。

### 4.2 为什么必须“静默窗口”，不能“子会话一 idle 就发”

因为子 Agent 结算会给父 Agent 发 completion notice；如果父 Agent 当时 idle，这个 notice 会启动一个新的父 turn（$PKG/dsh-tool-subagent/README.md:170）。时序：

    子 status false
      -> 父收到 notice
      -> 父 status true（新 turn）
      -> 父处理完
      -> 父 status false

如果插件在“子 status false”立刻判定全部完成，就会在父的新 turn 开始前发一条；等父再次完成又会发一条。**必须等父完成对 notice 的处理并再次 idle。**

官方 Host 算法用“parent stays idle with an unchanged Session sequence across the child check”解决同样的问题（$PKG/dsh-subagent/README.md:119）。客户端拿不到 waitForChildren，但可以用 QUIET_MS + 重新读取权威源近似“sequence unchanged”。

### 4.3 数据结构

    // 会话元信息：来自 list 基线或 api-session/added
    // id -> { parentId, origin }
    var sessionMeta = new Map();

    // 每个 session 的 running：status 事件优先，list 基线兜底
    var runningState = new Map();

    // rootId -> 当前周期
    // { startedAt, timer, notified, agents:Set<sessionId>, sawRunning:boolean }
    var cycles = new Map();

    // 已知 running 但还没拿到 parent 的 session；等 added/list 补齐
    var unknownRunning = new Set();

    // 与现有 pending 逻辑共用；也可以直接从 uiSession.sessionStatus 快照读
    var pendingBySession = new Map();

    var QUIET_MS = 1500; // 建议 1.5-3s，需真机调参

### 4.4 状态机

    DORMANT
      -- root 或后代 running=true --> ACTIVE（新周期，startedAt=now）

    ACTIVE
      -- 任一 running=true --> ACTIVE（重置静默计时；记录 agents）
      -- 子树仍有 running / pending --> ACTIVE（不排 timer）
      -- root 与全部后代都 idle 且无 pending --> SETTLING（排 QUIET_MS timer）

    SETTLING
      -- 任一 running=true / pending 出现 / 新子会话 running --> ACTIVE（取消 timer）
      -- timer 到点 --> 重新读取权威源
            仍 busy --> ACTIVE
            已静默 --> NOTIFY（每周期一次）--> DORMANT

    NOTIFY
      -- 新 running=true --> ACTIVE（新周期）
      -- 用户没有新动作 --> DORMANT

两个策略变体：

- **root-anchored（推荐，默认）**：只有 root 自己 running 才开启新周期；root idle 时子会话单独被唤醒（例如 teammate 收到消息）不新建周期，也不发通知。它精确对应“主任务完成前不要把子任务当成完成”的诉求，噪声最低。
- **tree-anchored（可选）**：子树内任意 running 都开周期；teammate 单独被唤醒并完成时也发通知。更符合“所有智能体”的字面语义，但可能对每次 teammate 往返都弹通知。建议作为后续配置项，不要默认开。

### 4.5 事件处理

（1）api-session/status(sessionId, running)

    runningState.set(sessionId, running)

    if (running) {
      var root = rootOf(sessionId)
      if (root === undefined) {
        unknownRunning.add(sessionId)   // 元信息未到，先记着
        return
      }
      if (sessionId === root || TREE_ANCHORED) {
        var cycle = ensureCycle(root)
        cycle.startedAt = cycle.startedAt !== undefined ? cycle.startedAt : now
        cycle.agents.add(sessionId)
        cancelTimer(cycle)
      } else {
        // root-anchored：子会话 running 只负责“阻止完成”，不新开周期
        var cycle = cycles.get(root)
        if (cycle !== undefined) cancelTimer(cycle)
      }
      return
    }

    var root = rootOf(sessionId)
    if (root !== undefined) evaluate(root)

rootOf 的实现：

    function rootOf(id) {
      var current = id
      var guard = 0
      while (current !== undefined && guard++ < 64) {
        var meta = sessionMeta.get(current)
        if (meta === undefined) return undefined   // 元信息缺失：不要猜
        if (meta.origin !== 'subagent') return current
        current = meta.parentId
      }
      return undefined  // 孤儿/环：不参与任何 root 的完成判定
    }

（2）api-session/added(summary)

    if (!summary || !summary.sessionId) return
    sessionMeta.set(summary.sessionId, {
      parentId: summary.parentSessionId,
      origin: summary.origin
    })
    if (typeof summary.running === 'boolean') runningState.set(summary.sessionId, summary.running)
    unknownRunning.delete(summary.sessionId)
    // 如果这个 child 的 parent 属于某个活跃周期，且 child running，取消 timer
    // 如果 summary 是 root 且 running，按 root-anchored 开周期
    recomputeAll()

注意：api-session/added 不只在 session 创建时发，agent/created 和 agent/disposed 也会重发 summary（$PKG/dsh-api-session-controller/lib/index.js:3831-3835），所以它既可用于发现新子会话，也可用于修正 running/agentAvailable。

（3）api-session/removed(sessionId)

    sessionMeta.delete(sessionId)
    runningState.delete(sessionId)
    unknownRunning.delete(sessionId)
    pendingBySession.delete(sessionId)
    var root = rootOf(sessionId) // 注意：删除前先算，或从 cycles 里找包含它的周期
    if (root !== undefined) evaluate(root)
    closeSession(sessionId)      // 保留现有通知清理

（4）uiSession.sessionStatus 变化

现有 pending interaction effect（src/client.js:1103-1162）已经在每次快照变化时 reconcile。扩展它：
- 更新 pendingBySession（不只是 announcedPending）。
- 每次 reconcile 后调用 recomputeAll()，让“子会话出现 pending”取消 timer，“pending 消失且全部 idle”重新排 timer。

（5）ctx.sessions.list 基线

    function seedFromList() {
      var state = ctx.sessions.list.getSnapshot()
      if (!state || !state.byId) return
      Object.keys(state.byId).forEach(function (id) {
        var row = state.byId[id]
        sessionMeta.set(id, { parentId: row.parentId, origin: row.origin })
        if (typeof row.running === 'boolean') runningState.set(id, row.running)
        if (row.origin !== 'subagent' && row.running === true) {
          // 页面在运行中途加载：开周期，但不要立刻通知
          var cycle = ensureCycle(id)
          cycle.startedAt = cycle.startedAt !== undefined ? cycle.startedAt : Date.now()
        }
      })
    }

订阅：ctx.sessions.list.subscribe(seedFromList)（官方 ui-session 同款，$PKG/dsh-client-ui-session/lib/client.js:808-813、966）。如果部署没有该 store 或没有 subscribe，保持现有行为。

重要：**seed 绝不能触发通知**。只建立 running/cycle 的初始状态；通知只由“之后观察到的 false 边”触发。

### 4.6 evaluate 与 timer

    function evaluate(root) {
      var cycle = cycles.get(root)
      if (cycle === undefined) return
      if (runningState.get(root) === true) { cancelTimer(cycle); return }
      if (subtreeBusy(root)) { cancelTimer(cycle); return }
      if (unknownRunning.size > 0 && listPhase !== 'ready') return // 基线未到，先不判定
      scheduleTimer(root)
    }

    function subtreeBusy(root) {
      for (var entry of sessionMeta) {
        var id = entry[0]
        if (id !== root && !isDescendant(id, root)) continue
        if (runningState.get(id) === true) return true
        if (pendingBySession.has(id)) return true
      }
      return false
    }

    function onTimer(root) {
      var cycle = cycles.get(root)
      if (cycle === undefined || cycle.notified) return
      // 不要只信缓存：重新读 list + status 快照
      if (runningState.get(root) === true || subtreeBusy(root)) return
      cycle.notified = true
      var durationMs = cycle.startedAt === undefined ? undefined : Math.max(0, Date.now() - cycle.startedAt)
      notifyRootComplete(root, { durationMs: durationMs, agentCount: cycle.agents.size })
      cycles.delete(root)
    }

isDescendant 用 parent 链 + visited 防环；不要用“前缀匹配”或数组顺序。

### 4.7 去重

- **每周期一次**：cycle.notified + cycles.delete(root)。任何新的 running=true 会建新周期，允许下一次完成通知。
- **同会话替换**：现有 replaceBySession 以 root sessionId 为 key（src/client.js:466-474），通知中心里每个 root 最多一条；子会话不会再单独占一条。
- **不持久化**：页面刷新后不补发历史完成；这是现有架构接受的限制（docs/adr/0001-notification-channel.md:35）。
- **timer 取消**：SETTLING 期间任何 running/pending/added(新 child running) 都取消 timer；避免“刚好在父新 turn 前发出去”。

### 4.8 边界情形

| 边界 | 行为 | 依据/说明 |
|---|---|---|
| 子会话 pending interaction（question/approval） | 视为 subtree busy，不完成；交互消失且全部 idle 后重新计时 | uiSession.sessionStatus 暴露 pendingInteraction（$PKG/dsh-client-ui-session/lib/client.js:992-1007）；现有 pending effect 已能读到（src/client.js:1103-1162） |
| 子会话 question/approval 的通知 | **当前会被 isSubagent 一并静默**，会出现“完成被阻塞但用户不知道子在等” | src/client.js:531-533、551；建议至少对子会话的 question/approval 发一条“子智能体需要你”的通知，或把它并进 root 的通知 |
| 子会话失败（api-session/error） | 当前被 isSubagent 静默；完成通知仍可能说“已完成” | api-session/error 来自 agent/error（$PKG/dsh-api-session-controller/lib/index.js:3839-3841）；建议把 child error 记入周期，完成文案标注“N 个子智能体失败”，或单独发错误通知 |
| root 失败 | 现有错误通知会发；完成通知可能在 status false 时也发 | 建议：root 出错后把周期标记 failed，抑制 complete，避免“失败 + 已完成”双弹 |
| 取消/中断 | AgentStatus 只有 idle/running（$PKG/dsh-api-session-controller/lib/typert.host.js:2924），status 事件不带 turn/end.reason；因此取消后也会显示“已完成” | 要区分需读 turn/end.reason（$PKG/dsh-api-session-controller/lib/typert.host.js:4060），属于额外 Session 事件流工作；v1 建议明确接受该限制 |
| 后台 job 仍在跑 | Agent idle 不代表 job 结束；当前完成通知会提前发 | job 有独立 registry，浏览器可用 ctx.jobs.watchRows(sessionId) 看 job roster，row 带 status: running/stopping/...（$PKG/dsh-api-job-controller/README.md:11、29；$PKG/dsh-api-job-controller/lib/typert.host.js:79-95）。注意 roster 是“自己的 job + 所有 unowned job”（README:25），必须按 row.owner 过滤，否则别的会话的 job 会永久阻塞 |
| 会话新 turn（用户又发消息） | status true 取消静默 timer，开启新周期；完成后按 replaceBySession 顶掉旧通知 | src/client.js:466-474；与现有行为一致 |
| 子智能体稍后启动 | 两种：root turn 内启动 -> 子 running 早于 root false，天然阻塞；root idle 后被消息唤醒 -> root-anchored 不新开周期，tree-anchored 会 | teammate 的 inactive 成员可被消息唤醒（$PKG/dsh-experimental-agent-team/README.md:62）；建议默认 root-anchored |
| external subagent | 无本地 Session、无 agent/status，客户端无法知道它是否在跑；完成可能提前 | “External entries use mode: 'external' to identify children without a local Session”（$PKG/dsh-subagent/README.md:123）；这是路线 A 的硬限制，报告中明确不承诺覆盖 |
| teammate provisioning / failed | provisioning 发生在 root turn 内；failed 成员没有 running 子会话，不应阻塞 | teammate 走 subagents.startActivation 且保留 childId（$PKG/dsh-experimental-agent-team/lib/types/roster.js:236-248）；reserved childId 要求 local backend（$PKG/dsh-subagent/lib/types/index.js:138-142）；phase 见 $PKG/dsh-api-session-controller/lib/typert.host.js:227 |
| 页面刷新/中途挂载 | 从 list 基线 seed running/cycle；不因“加载时已经 idle”而发通知；挂载时正在跑的周期完成后仍会通知 | 官方 ui-session 的 running 也来自基线或 status 事件（$PKG/dsh-client-ui-session/README.md:13） |
| 多个 root 并发 | 每个 root 独立 cycle/timer；互不影响 | per-session 事件天然按 root 分桶 |
| 孤儿子会话 / 环 | rootOf 返回 undefined：不参与任何 root 的完成判定，也不单独发通知 | flattenLineage 对孤儿降级为 root、对环 fail-soft（$PKG/dsh-api-session-controller/lib/types/client/sessions/lineage.js:25、32）；聚合器不要把它当 root |
| 子会话被 removed（运行中被销毁） | 清理其 running/meta，重新 evaluate 所属 root | removed 事件在 src/client.js:1089-1095 已有清理，扩展即可 |
| 插件 dispose | 清空所有 timer/map，关闭通知 | 现有 teardown 在 src/client.js:1197-1212；加 timer 清理 |
| 客户端断线/重连 | 重连后 list 基线重新 seed；断线期间完成的周期不补发 | 与“App 关闭没有通知”的取舍一致（docs/adr/0001-notification-channel.md:35） |

### 4.9 文案与配置

- 保持 notifyOnComplete 的语义，不新增必填配置；最小改造不发散配置面。
- 建议新增一个 volatile 配置（可选、默认 true）如 notifyOnCompleteScope: 'root' | 'tree'，或者更简单的 aggregateSubagents: true，用于在 root-anchored 与 tree-anchored 之间切换。若不想动 src/index.ts，可先固定 root-anchored。
- 文案：root 自己跑完用现有 body.complete / body.completeWithDuration；子树内至少有一个子会话参与时，用新 key，例如：
    zh: 全部 {count} 个智能体已完成
    en: All {count} agents finished
  仍拼上 duration 与 project，保持现有格式（src/client.js:351-397）。
- 标题仍用 root 的 title projection / cwd basename（src/client.js:385-396）。子会话标题不进入标题，避免误导。
- 若采用“子会话 pending/error 也通知”的扩展，通知仍以 root 为 key，正文标注“子智能体”来源。

---

## 5. 最小改造涉及文件与建议测试（不修改代码）

### 5.1 生产代码：只需要 src/client.js

| 位置 | 改动 |
|---|---|
| src/client.js:400-412 | 在 notification store 区域新增 sessionMeta、runningState、cycles、unknownRunning、pendingBySession、QUIET_MS；保留 subagentSessions（其他通知仍可用） |
| src/client.js:506-522 | sessionFacts 可复用；新增 rootOf / isDescendant / rootCycle 辅助函数 |
| src/client.js:1047-1062 | 用 handleSessionStatus 替换现有 handler：running=true 开/续周期；false 时 evaluate(root)；不再直接 notify complete |
| src/client.js:1074-1087 | api-session/added：记录 sessionMeta/running，unknownRunning 迁移，recomputeAll |
| src/client.js:1089-1095 | api-session/removed：清理 meta/running/pending/timer，re-evaluate 所属 root |
| src/client.js:1103-1162 | pending interaction reconcile：更新 pendingBySession，并在每次快照变化后 recomputeAll；保留现有 question/approval 通知逻辑 |
| src/client.js:1197-1212 | teardown：清空 cycles 的所有 timer、sessionMeta、runningState、unknownRunning、pendingBySession |
| src/client.js:545-556 | 保持 isSubagent 对 error/question/approval 的现有过滤；新增独立的 notifyRootComplete，不经过 isSubagent（因为 root 本身不是 subagent） |
| 可选 | ctx.sessions.list.subscribe(seedFromList)；若不存在 subscribe 则降级为只靠 status/added |

不需要改 src/index.ts（除非新增配置字段）。不需要新增依赖。

### 5.2 测试辅助：tests/helpers/client-harness.mjs

| 位置 | 改动 |
|---|---|
| 244-253 | sessions.list 增加 subscribe / setList，模拟 list 基线变化 |
| 443-451 | session() 已支持 extra；测试直接传 { origin: 'subagent', parentId: 'root', running: true } |
| 116 / 154 | 建议加虚拟 timer（或使用 node:test 的 mock timers），让 QUIET_MS 可控；否则测试要真实等待 1.5s+ |
| 170-180 | sessionStatus 已有 getSnapshot/subscribe/upsertPending，可直接驱动 pending 变化 |

### 5.3 测试用例：tests/notifications.test.mjs

建议至少覆盖：

1. **主完成、子仍 running 不通知**：root true -> kid true -> root false => 0；kid false -> 静默后 => 1，且 body 是“全部 2 个智能体已完成”或旧文案。
2. **子结算唤醒父 turn 不双弹**：root true -> kid true -> root false -> kid false -> root true（notice）-> root false => 静默后只有 1 条。
3. **孙会话阻断**：root -> kid -> grandkid，grandkid running 时 root/kid idle => 0；grandkid idle 后 => 1。
4. **teammate 同源**：kid 用 origin: 'subagent'、parentId: root；kid 自身 false 不单独通知；root 完成时只一条。
5. **子 pending interaction 阻断**：kid pending approval，root idle => 0；clearPending 后 => 静默后 1。
6. **基线不误报**：list 里 root/kid 都 idle，mount 后不发通知。
7. **中途挂载正在跑**：list 里 root running=true；root false => 静默后 1。
8. **root-anchored：子会话单独唤醒不发通知**（如果采用默认策略）；tree-anchored 变体则断言会发。
9. **removed 运行中子会话释放阻塞**：kid removed 后 root 可完成。
10. **多 root 独立**：rootA/rootB 交替 true/false，各自各一条，不串。
11. **dispose 清 timer**：进入 SETTLING 后 dispose，时间到不产生通知。
12. **replaceBySession 仍生效**：root 连续两个周期，通知中心只留最新一条。
13. **error 周期策略**（若采纳）：root api-session/error 后不再发 complete；child error 时完成文案标注失败。
14. **external 不阻塞**：catalog 里 mode external 的条目不会被当成 running；完成不被它卡住（同时记录这是已知限制）。

### 5.4 文档（后续，不在本次改动内）

- docs/m1-spec.md:20-22 的“子智能体会话不发通知”需要改成“子会话不单独发通知；完成通知按 root 子树聚合”。
- docs/adr/0001-notification-channel.md:36 应补一句“per-session api-session/status 对子会话可达；不做的是 raw subagent/* 事件”。
- README.md:53、64 的“子智能体不通知”需要澄清。
- 可新增 docs/adr/0004-all-agents-completion.md 记录状态机与限制。

---

## 6. 无法确认/需要产品或真机确认的问题

1. **官方 question/approval 插件是否对所有子会话都发布 pendingInteraction**：代码上 pendingDomains 按 interaction.sessionId 汇总（$PKG/dsh-client-ui-session/lib/client.js:949-963），现有插件也全量扫描（src/client.js:1103-1162），但没有在真机上验证“子会话提问时父窗口一定收到”。这决定“子 pending 阻断完成”是否可靠。
2. **Host list 在非 owner / 远程访问策略下是否包含子会话**：owner 应该包含（sessionQuery 是 every logical session，$PKG/dsh-session-query/README.md:34；flattenLineage 专为 subagent 行设计），但 dsh-notice 也可能在 dsh web 或多 peer 场景运行；非 owner 可能只拿到部分行。桌面单 owner 场景风险低。
3. **external subagent 的完成时机**：没有本地 Session/status，客户端无法观测；如果用户的 profile 使用 ACP/Codex/Claude Code 等外部 provider，本方案无法保证“等它完成”。需要确认 dsh-notice 的目标 profile 是否只用 in-process spawn/fork。
4. **取消/中断与失败的区分**：api-session/status 只有 idle/running；turn/end.reason 在 Session 事件里（$PKG/dsh-api-session-controller/lib/typert.host.js:4060），但当前插件没有订阅 Session 事件流。v1 会把取消显示成“已完成”，需要产品确认是否接受。
5. **后台 job 是否应纳入“完成”**：ctx.jobs 是公开客户端服务，但把 job 纳入会显著拉长通知等待，而且 roster 含 unowned job（$PKG/dsh-api-job-controller/README.md:25），必须按 owner 过滤。建议先不纳入，作为单独需求。
6. **QUIET_MS 的具体值**：1.5s 是工程估计；需要真机测“子结算 -> 父 notice -> 父 status true”的最大延迟。太短会双弹，太长会延迟通知。建议做成常量并可被测试覆盖，后续可配置。
7. **客户端服务形状的长期稳定性**：ctx.sessions.list、uiSession.sessionStatus、api-session/status 都是当前官方实现面，但没有第三方插件 ABI 承诺；需要 engines.dsh 约束 + 防御式读取 + 降级测试。
8. **teammate 是否可能走 external provider**：roster 的 startActivation 保留 childId，subagent 明确“reserved child ids require a local backend”（$PKG/dsh-subagent/lib/types/index.js:138-142），所以当前 teammate 是本地子会话；如果未来支持外部 teammate，本方案需要重估。

---

## 7. 关键证据索引

| 结论 | 证据 |
|---|---|
| completion 由 api-session/status false 触发 | src/client.js:1048-1057 |
| 子会话被 isSubagent 过滤 | src/client.js:531-533、551 |
| Host 由 agent/status 发 per-session status | $PKG/dsh-api-session-controller/lib/index.js:3836-3838 |
| status 白名单与资源映射 | $PKG/dsh-api-remotes/lib/types/remote-events.js:16-47 |
| AgentStatus 只有 idle/running | $PKG/dsh-api-session-controller/lib/typert.host.js:2924 |
| Agent idle 的判定 | $PKG/dsh-agent-loop/lib/index.js:554-556 |
| SessionSummary 含 running/parent/origin | $PKG/dsh-api-session-controller/lib/typert.host.js:3819-3821 |
| list 的 running 取 Agent status | $PKG/dsh-api-session-controller/lib/index.js:2733-2745 |
| subagent 工具立即返回 childId | $PKG/dsh-tool-subagent/lib/index.js:464-473 |
| 父 Agent 应结束 turn，子结算会唤醒父 | $PKG/dsh-tool-subagent/README.md:170 |
| 工具立即返回、父级后收 notice | $PKG/dsh-subagent/README.md:45 |
| 官方 Host 的 whenIdle + waitForChildren 循环 | $PKG/dsh-subagent/README.md:119 |
| waitForChildren 的完整实现 | $PKG/dsh-subagent/lib/types/manager.js:190-231 |
| waitForChildren 是 Host 服务 | $PKG/dsh-subagent/lib/types/index.js:155-163 |
| 浏览器 subagents Remote 只有 prompt/interrupt | $PKG/dsh-subagent/lib/typert.host.js:63-66、132 |
| subagentCatalog 无 execution status | $PKG/dsh-api-session-controller/lib/typert.host.js:1084-1104；$PKG/dsh-subagent/README.md:123 |
| subagentTiming 是 child 时序投影 | $PKG/dsh-api-session-controller/lib/typert.host.js:1105-1112 |
| agentTeam phase 是 durable，running 来自 Session status | $PKG/dsh-api-session-controller/lib/typert.host.js:222-243（第 227 行） |
| teammate 是 subagent 子会话 | $PKG/dsh-experimental-agent-team/lib/types/roster.js:236-248；$PKG/dsh-subagent/lib/types/child-agent.js:107-120 |
| teammate 的 inactive 可被唤醒 | $PKG/dsh-experimental-agent-team/README.md:62 |
| 子智能体 UI 用 Session status 算 running | $PKG/dsh-client-ui-subagent/lib/client.js:357-372、393 |
| Teams UI 用 Session status 算 running | $PKG/dsh-experimental-client-ui-agent-team/lib/client.js:90-92 |
| uiSession.sessionStatus 的形状 | $PKG/dsh-client-ui-session/lib/client.js:782-790、992-1007 |
| running 来自 list 基线或 status 事件 | $PKG/dsh-client-ui-session/README.md:13 |
| 客户端列表行含 running/parentId/origin | $PKG/dsh-api-session-controller/lib/client.js:4162-4182 |
| list 包含 every logical session | $PKG/dsh-session-query/README.md:34 |
| 父子/孤儿/环的处理 | $PKG/dsh-api-session-controller/lib/types/client/sessions/lineage.js:11-54 |
| session/wait 只等单 session | $PKG/dsh-api-session-controller/lib/typert.host.js:3859-3861；$PKG/dsh-api-session-controller/lib/types/state/controller.js:260-276 |
| workspace/session-activity 是 Host 聚合 | $PKG/dsh-subagent/README.md:138；$PKG/dsh-workspace/README.md:103 |
| job 有独立 status，roster 含 unowned | $PKG/dsh-api-job-controller/README.md:11、25、29；$PKG/dsh-api-job-controller/lib/typert.host.js:79-95 |
| 取消原因不在 status 里 | $PKG/dsh-api-session-controller/lib/typert.host.js:2924；turn/end.reason 在 4060 |
| 客户端半发通知的架构约束 | docs/adr/0001-notification-channel.md:20、35 |
| 现有 spec 的完成语义与子会话过滤 | docs/m1-spec.md:20-22 |
| pending interaction 走 uiSession | docs/adr/0003-pending-interactions-over-waterfall.md:27-38 |

---

## 8. 一句话建议

**不要试图监听 subagent 专用事件（它们确实不可达），而是把 api-session/status 当成“每个 Agent 的 running 边”，在客户端维护 root -> descendants 的树，用“子树静默窗口 + 每周期一次 + 同 root 替换”的聚合器决定何时发 completion。** 这是当前公开 API 下最小、最稳、可测试的解法；同时必须明确 external subagent、取消原因、后台 job 三个不承诺项。

