# dsh-notice：all-agents-completion 实施交接

- 存档时间：2026-11-08（Asia/Shanghai）
- 当前分支：`main`
- 实施规格：[all-agents-completion-spec.md](all-agents-completion-spec.md)
- 状态：**已按用户要求暂停，尚未完成、尚未提交**
- 持久目标：`goal-1ca2e4e1-a0c4-4421-be13-320d8411ce0c` 已暂停；新会话用户要求继续时应先恢复该目标。

## 1. 已确认的实施边界

- 只调整客户端半的最终完成判定：根会话及其全部可观察本地后代均 idle、无 pending，并连续静默 2000ms 后才投递。
- root-anchored：只有根会话 `running=true` 开周期；子会话单独运行不建周期。
- 每根会话每周期最多一条完成通知；先消费周期再投递，配置关闭或前台抑制均不重放。
- 不新增配置、locale key、生产测试接口、依赖、Host 半逻辑或通知通道。
- 测试 seam 已确认：只通过 `apply(ctx)`、公开事件/快照和 `FakeNotification` 观察外部行为。
- 子智能体模型按用户确认使用 `deepseek-account/deepseek-flash`（`opencode-go` 当时未获本会话允许）。

## 2. 已完成并由主智能体验证的切片

### 2.1 Harness 与单根周期

- `tests/helpers/client-harness.mjs` 已有：
  - `sessions.list.subscribe(listener)`；`setSummaries(next, ids?)` 同步通知并隔离 listener 异常。
  - 可选 `ids` 区分 Host-listed 与 byId-only fallback。
  - 虚拟 `setTimeout`/`clearTimeout`、`advance(ms)`、`setNow`；按到期时间和插入序执行，回调内新 timer 可在同一推进窗口执行，迭代上限 1000。
- `src/client.js` 已有根周期、`Active`/`Quiet`、2000ms timer、到期重读、耗时口径和 dispose 清理。
- `tests/notifications.test.mjs` 的既有完成用例已适配虚拟 2000ms 窗口。

### 2.2 任意深度子树、多 root、added/list

- 任意深度 parent 链、64 层防环、orphan 判定；teammate 与普通 subagent 同走 `origin='subagent'`。
- `api-session/added` 合并 `sessionId`/`parentSessionId`/`origin`/`running`。
- Host-listed list 行可权威纠正 running；byId-only fallback 只合元数据，不以 false 清除 status=true。
- 初次 baseline 只补缺失，不覆盖事件观察；后续列表变化可驱动已有周期完成。
- 多 root 的 cycle/timer/通知 key 独立；周期内根多次 turn 不重置 startedAt。

### 2.3 Pending 与未归属阻断

- `pendingBySession` 与 `announcedPending` 分离；任何非 null pending 均阻断，包括 keyless/未知 kind。
- 现有 pending 通知的 key 去重、kind 映射与子会话过滤保持原样。
- `unattributedRunning`/`unattributedPending` 全局阻断所有 root；元数据到达或观察消失后重评。
- 缺元数据时做一次列表单点读取；该读取不覆盖刚到达的 status。
- timer 到期同步重读 list 与 sessionStatus；pending 读取失败保留旧阻断、不投递。
- 无 `uiSession` 时按 running-only 降级。

### 2.4 最后一个已验证检查点

主智能体实际执行并通过：

```sh
node --test tests/all-agents-completion.test.mjs tests/notifications.test.mjs tests/pending-interactions.test.mjs
# 96 pass / 0 fail

npm run typecheck
# pass

git diff --check
# pass
```

**注意：上述 96 测试结果只对应第三切片结束时的主智能体验证检查点。暂停前第四切片子智能体已自然结束并回传完成，但主智能体按暂停要求未再复核；新会话必须以当前实际文件重新验证。**

## 3. 暂停前最后回传的第四切片

第四切片子智能体 `0bb4909f-d216-424b-9126-1601ec3b2b27` 已自然结束，不再有运行中的实现或后台写入。它回传了以下结果，**尚未经主智能体验证**：

- 新增 `handleRemoved`：清理 sessionMeta/running/pending/announced/unattributed/subagentSessions，root removed 取消 cycle，child/unattributed removed 重评；无 tombstone，后续 list/added 可恢复。
- 新增 D5/D6/D10、removed 后 orphan/重归属、Quiet 中移除 idle child、added(root,true) 取消 Quiet、重 parenting、重复事件、seed 耗时、环/深度守卫、E1-E12 等测试。
- 移除 harness 的 `listPhase`/`setListPhase`/`listSubscribable` 专用 API；测试改通过公开 store 方法替身驱动。
- 子智能体报告：聚合套件 84 tests；聚合 + notifications + pending + settings 共 **136 pass / 0 fail**；`npm run typecheck` 与 `git diff --check` 通过。
- 子智能体未运行完整 `npm test`，未提交。

新会话先复核这些回传和当前文件，不要只凭报告认定完成。

## 4. 当前文件与既有修改归属

### 本任务实施文件

- `src/client.js`
- `tests/helpers/client-harness.mjs`
- `tests/notifications.test.mjs`
- `tests/all-agents-completion.test.mjs`（新增）
- 最终构建后还应检查 `lib/client.js`；截至第三切片尚未 rebuild。

### 用户/前序工作已有未提交修改，不能覆盖或误提交

- `CONTEXT.md`
- `README.md`
- `docs/handoff-m1-acceptance.md`
- `docs/m1-spec.md`
- `tests/settings.test.mjs`
- `docs/all-agents-completion-spec.md` 与 `docs/research/` 在任务开始时已是 untracked。
- `src/client.js` 中设置页 bundle slot/宽度等修改在任务开始前已存在。
- `tests/helpers/client-harness.mjs` 中 `registrations`/`injectedSlots` 等设置在任务开始前已存在。

最终提交应只暂存本次聚合功能差异，保留上述其他工作区修改。不要直接 `git add -A` 或提交全部 dirty 文件。

## 5. 新会话建议恢复顺序

1. 阅读本交接、实施规格、`CONTEXT.md` 与 ADR 0001/0002/0003；恢复暂停目标。
2. 复核第四切片回传与当前工作区；运行 `git status --short --branch`、`git diff --check`，阅读当前 `src/client.js` 和测试。
3. 重新运行四个客户端测试文件（聚合、notifications、pending、settings）与 `npm run typecheck`，确认当前实际检查点。
4. 若复核发现缺漏，补齐实现与测试；保持 TDD red→green 和公开 seam。
5. 运行 `npm run typecheck`、相关单测，最后运行一次完整 `npm test`（会 build 并更新 `lib/client.js`）。
6. 使用 `/code-review` 同时做 Standards 与 Spec 审查，修复发现后重跑验证。
7. 审查最终 diff，选择性暂存并提交到当前 `main`；不要混入前序无关 dirty 修改。
8. 规格的真机清单尚未执行：本地 subagent、teammate、任意深度、子 pending、多 root、刷新/中途挂载、前台抑制、通知替换等均不能宣称真机通过。

## 6. 明确未完成

- 第四切片已回传完成，但未经主智能体复核。
- 完整 `npm test` 尚未运行；`lib/client.js` 尚未与最新源码同步。
- `/code-review` 尚未执行。
- 真机验收尚未执行。
- 尚未创建 git commit。
