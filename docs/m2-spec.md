# M2 实现规格：点击通知跳转会话

状态：已定稿（M2 验收范围）。背景与术语见 [CONTEXT.md](../CONTEXT.md)；M1 的范围与产品行为见 [M1 实现规格](m1-spec.md)；通知通道的取舍见 [ADR 0001](adr/0001-notification-channel.md)。

## 背景

M1 已发布：四类触发事件（最终完成、询问、权限、错误）各自开关，配置页 8 项，点击通知只把窗口带到前台。M2 只改点击路径——点击通知后，在当前 DSH 窗口把主视图切换到该通知所属会话，让「收到通知 → 回到该会话」形成闭环。

M2 不改通知的触发判定、文案、配置项与宿主半：仍为 8 项配置，不新增开关，不新增 UI 文案。跳转失败不打断通知本身，静默退化为 M1 的「只把窗口带到前台」。

## 产品行为

四类触发事件的通知点击行为一致：

| 触发事件 | 通知来源（M1） | 点击后的行为 |
|---|---|---|
| 最终完成 | `api-session/status` 变为 `running === false` | 把当前窗口的主视图切换到该会话 → 窗口带到前台 → 关闭该条通知 |
| 询问 | `uiSession.sessionStatus` 的 `pendingInteraction.kind` 为 `question` / `plan-review` | 同上 |
| 权限 | 同源的 `pendingInteraction.kind === "approval"` | 同上 |
| 错误 | `api-session/error` | 同上 |

点击路径固定为四步：

1. 通知创建时已绑定所属会话的 `sessionId`；点击回调从该通知取回它。
2. 能跳转时，把当前窗口的主视图切换到该会话；不新开窗口、不新开标签或面板。
3. 把桌面窗口带到前台（`window.focus()`，与 M1 相同）。
4. 关闭这条通知。

「发送测试通知」没有所属会话：点击只执行第 3、4 步，不切换主视图。

**静默降级**：第 2 步无法完成时跳过它，第 3、4 步照常执行；不弹错误提示，只 `console.warn`。触发降级的三种情况见「失败与降级矩阵」。归档会话不自动取消归档，也不尝试打开。

**已读跟随框架**：跳转后 DSH 在主视图切换到会话时自动清除其完成未读标记；插件不额外读写未读状态，也不新增相应文案。

## 已定决策

| 决策 | 结论 |
|---|---|
| 点击范围 | 四类触发事件（最终完成 / 询问 / 权限 / 错误）一律跳转，不按触发类型区分点击行为。 |
| 跳转落点 | 在当前 DSH 窗口把主视图切换到目标会话，不新开窗口、不新开标签或面板。 |
| 跳转方式 | 使用官方客户端工作区服务的 `ctx.uiWorkspace.openSession(sessionId)`，不自行改路由或重建选择状态。 |
| 会话身份 | 通知对象保留所属会话的 `sessionId` 到点击回调；点击时以该 id 定位，不从当前选中会话推断。 |
| 测试通知 | 设置页「发送测试通知」没有所属会话：点击只把窗口带到前台，不切换主视图。 |
| 前台化与关闭 | 沿用 M1 的 `window.focus()` 把窗口带到前台，随后关闭被点击的通知。 |
| 服务不可用 | 导航服务不可用（老版本或非桌面部署）时静默降级：只聚焦窗口，仅 `console.warn`，不弹错误提示。 |
| 归档会话 | 目标会话已归档时不自动取消归档、也不强行打开：只把窗口带到前台，仅 `console.warn`。 |
| 会话不存在 | 目标会话已不存在、`openSession` 同步抛错时捕获并降级为只聚焦，仅 `console.warn`；错误不外抛，不影响通知关闭。 |
| 配置项 | 不新增配置开关，配置仍为 8 项 volatile 字段；跳转是点击行为的固定部分，不可关闭。 |
| 文案 | 不新增 UI 文案与提示；降级对用户不可见，只有控制台日志。 |
| 已读标记 | 跟随框架：DSH 在会话成为主视图时自动清除完成未读，插件不额外处理。 |
| 兼容取用 | 用 `ctx.get("uiWorkspace")` 取服务并判空，不写进必需 `inject`，避免旧版本上整个插件激活失败。 |
| 判定顺序 | 服务可用 → 会话未归档 → 调用 `openSession`；任一步失败即降级。跳转不等待会话历史加载完成。 |

## 实现依据

以下事实核对自本机桌面版 **0.2.2-rc.2** 的源码解包（`/tmp/dsh-asar`）。客户端包路径省略前缀 `/tmp/dsh-asar/dsh/node_modules/@deepseek-ai/`，桌面壳文件单独标注。

**1. `openSession` 的契约**

- `dsh-client-ui-workspace/src/client/navigation.ts:293-295`：`openSession(target)` 同步调用 `replaceMain(target, signal, "reveal")`。
- `dsh-client-ui-workspace/src/client/navigation.ts:523-553`：`replaceMain` 同步 retain 目标会话、写入 `selection` 并释放旧的 main 引用，不等待 `reference.ready`；失败时释放引用并把错误抛出。
- `dsh-client-ui-workspace/README.md:86`：`ctx.uiWorkspace.openSession(target)` 同步替换 mainView 引用，不等 `reference.ready`，历史加载在选中的会话视图内渲染。

结论：跳转是同步换主视图，历史随后加载；实现里不等待、也不应该等待历史加载完成。

**2. 官方调用范例**

- `dsh-client-ui-subagent/src/client/index.ts:35`：`inject` 含 `uiWorkspace`；同文件 `56-57`：`openChild` 直接调 `ctx.uiWorkspace.openSession(address)`。
- `dsh-client-ui-schedule/src/client/index.ts:154-157`：先用 `sessionLinkState(...) === "available"` 判断，再调 `ctx.uiWorkspace.openSession(id)`——官方同样「先判可用再跳」。
- `dsh-client-ui-conversation/src/client/apply.ts:163`：用 `ctx.get("uiWorkspace")` 取可选服务；同文件 `456`：`open: (id) => workspaceNavigation.openSession(id)`。

结论：官方插件同时存在「必需 inject」与「可选 `ctx.get` + 判空」两种取用方式。本插件是第三方晚加载，采用后者，避免把 `uiWorkspace` 写进必需 inject 后旧版本整包激活失败。

**3. 未知会话同步抛错**

- `dsh-api-session-controller/src/client/sessions/manager.ts:140-155`：`resolveTarget` 在目标既不在 retained、也不在 catalog summaries、且没有 subagent address 时，同步 `throw new Error("sessions.retain: unknown session <id>")`。
- `dsh-api-session-controller/src/client/sessions/service.ts:301-314`：`retain` 调用 `resolveTarget`，后续 `attachOpening` 失败时释放引用并抛出。

结论：会话不存在时 `openSession` 是同步抛错（不是返回失败值），必须 `try/catch` 后降级。

**4. 归档语义**

- `dsh-client-ui-workspace/src/client/index.ts:296-301`：打开 fork 源前先查 `workspaces.list` 快照的 `archivedSessionIds`；命中则发 `archivedNotOpenable` 提示并返回，不调用 `openSession`。
- `dsh-client-ui-workspace/src/client/locales.ts:197`：`"toast.archivedNotOpenable": "Archived sessions cannot be opened. Unarchive it to view."`
- `archivedSessionIds` 来自 `workspaces.list` 快照；navigation 的 `clearArchivedCurrent` 也读同一快照（`navigation.ts:507-513`）。官方 schedule 的 `sessionLinkState` 同样先查该快照（`dsh-client-ui-schedule/src/client/session-link.ts:21-27`）。

结论：官方不打开归档会话、也不自动取消归档。M2 沿用同一判定：命中归档即只聚焦，不提供「点击后取消归档」的行为，也不新增提示。

**5. 清除未读跟随框架**

- `dsh-client-ui-session/src/client/index.ts:508-543`：`observeRunning` 在会话重新 running 时删除 `completionUnread`，完成且非 main 时才加入；`reconcileStatus` 在 `isMain(id)` 为真时删除；`isMain` = `retainedBy.mainView > 0`（`541-543`）。

结论：mainView 引用建立后框架自行清未读；插件不写会话状态、不调用 markRead 类接口。

**6. 窗口能力边界**

- `lib/main.js:21610-21633`（桌面壳主进程）：`focusPrimaryWindow` 会 `restore()` 最小化窗口、`show()`、`focus()`；`lib/main.js:21639-21641`：`app.on("activate", (_event, hasVisibleWindows) => { if (!hasVisibleWindows) focusPrimaryWindow() })`。
- `/tmp/dsh-asar/lib/preload-app.cjs:1998-2112`：暴露给渲染进程的产品 API（`fileActions` / `browser` / `fileDrag` / `deviceInfo` / `keyboard` / `shortcuts` / `updates`）不含窗口 show / restore / focus 的 IPC。

结论：渲染进程没有显示或恢复窗口的权限，`window.focus()` 只能请求前台。窗口隐藏（红叉 / Cmd+H）时，点击通知依赖 macOS 激活 App 后触发主进程 `activate` 兜底；窗口最小化时是否走到同一条兜底路径未实测（见「真机验收清单」与「已知限制」）。

**7. 兼容性**

- `openSession` 在 0.2.1-rc.1、0.2.1-rc.2、0.2.2-rc.2 三版客户端产物中均存在（本机解包为 0.2.2-rc.2）。
- 因此按 Q14 用 `ctx.get("uiWorkspace")` 判空取用；服务缺失时插件照常加载，点击退化为只聚焦。

## 失败与降级矩阵

| 情况 | 检测点 | 主视图 | 窗口 | 通知 | 用户可见提示 |
|---|---|---|---|---|---|
| 正常 | `sessionId` 存在、服务可用、会话未归档、`openSession` 成功 | 切到目标会话 | 带到前台 | 关闭 | 无 |
| 测试通知（无 `sessionId`） | 通知未携带 `sessionId` | 不变 | 带到前台 | 关闭 | 无（正常路径，不算降级） |
| 导航服务不可用 | `ctx.get("uiWorkspace")` 为空 | 不变 | 带到前台 | 关闭 | 无，仅 `console.warn` |
| 会话已归档 | `archivedSessionIds` 命中 | 不变（不取消归档） | 带到前台 | 关闭 | 无，仅 `console.warn` |
| 会话已不存在 | `openSession` 同步抛错 | 不变 | 带到前台 | 关闭 | 无，仅 `console.warn` |
| 窗口隐藏（红叉 / Cmd+H） | 渲染进程无从检测与恢复 | 通常能切换（渲染进程仍在） | 依赖 macOS 激活 + 主进程 `activate` 兜底，能否弹出未实测 | 关闭 | 无 |
| 窗口最小化 | 同上 | 通常能切换 | 可能只激活 App、窗口留在 Dock（未实测） | 关闭 | 无 |
| App 完全退出后点击旧通知 | 渲染进程已销毁，不会回调 | 不变 | 不在本期范围 | 不处理 | 无 |

## 测试范围

自动化（纯逻辑单测，不启动桌面壳）：

- 正常路径：有 `sessionId`、服务可用、会话未归档 → 调用一次 `openSession(sessionId)`，随后请求窗口前台并关闭通知。
- 服务不可用：`ctx.get("uiWorkspace")` 为空 → 不调用 `openSession`，仍聚焦并关闭通知，`console.warn` 一次。
- 归档会话：`archivedSessionIds` 命中 → 不调用 `openSession`，也不取消归档，仍聚焦并关闭通知。
- 会话不存在：`openSession` 同步抛错 → 错误被捕获、不外抛，仍聚焦并关闭通知，`console.warn` 一次。
- 测试通知：没有 `sessionId` → 不调用 `openSession`。
- 兼容性取用：客户端半的必需 `inject` 不包含 `uiWorkspace`；服务缺失时插件激活不受影响。
- 回归：配置仍为 8 项（未新增开关）；通知触发、文案与前台抑制行为不变。

只做真机验收、不进单测的：窗口隐藏 / 最小化时的实际表现、冷启动旧通知、侧栏不定位、历史加载时序。

## 真机验收清单

- [ ] `pnpm run build` 与 `node --test tests/*.test.mjs` 通过（由实现方负责）。
- [ ] 重启桌面版后插件正常加载，配置页仍是 8 项 + 测试按钮 + 权限状态（M1 回归）。
- [ ] 窗口失焦时让一个会话达到最终完成 → 点击通知 → 当前窗口主视图切到该会话，窗口到前台，该通知消失。
- [ ] 四类触发事件（最终完成 / 询问 / 权限 / 错误）各点一次 → 都跳到对应会话，点击行为无差异。
- [ ] 两个会话各有一条通知 → 分别点击 → 各自跳到自己的会话，不串会话。
- [ ] 隐藏窗口（红叉 / Cmd+H）后点通知 → **记录实际表现**（窗口是否弹出、主视图是否切换）。
- [ ] 最小化窗口（黄点）后点通知 → **记录实际表现**（只激活 App 还是恢复窗口；未实测，验收时回填结论）。
- [ ] 让一个会话产生通知后归档它，再点该通知 → 只把窗口带到前台，不取消归档，无错误弹窗（控制台可见 `console.warn`）。
- [ ] 会话已不存在时点旧通知（可构造时）→ 只把窗口带到前台，无错误弹窗。
- [ ] 点设置页「发送测试通知」→ 只把窗口带到前台，不切换主视图。
- [ ] 点通知跳转后，侧栏该会话的完成未读标记消失（框架行为，插件不额外处理）。
- [ ] 完全退出 App 后点通知中心里的旧通知 → 记录现象，确认不回调渲染进程（已知限制，不在本期范围）。
- [ ] 窗口聚焦时不发通知（M1 前台抑制回归）。

## 已知限制

- **隐藏 / 最小化窗口时点击通知不一定能把窗口弹回来**：插件只有渲染进程权限，没有显示或恢复窗口的 IPC；`window.focus()` 不能把最小化或隐藏的窗口弹回来。窗口隐藏（红叉 / Cmd+H）时靠 macOS 激活 App 与 DSH 主进程 `activate` 兜底；窗口最小化时可能只激活 App、窗口仍留在 Dock——**未实测**，验收时确认并如实记录。
- **不覆盖 App 完全退出后的旧通知**：App 退出 / 重启后，通知中心里的旧通知对象随渲染进程销毁，点击不会回调插件；冷启动点击不在本期范围。
- **跳转不额外定位侧栏**：目标会话在其它工作区分组时，只切换主视图，不滚动或展开侧栏去定位该行。
- **跳转不等待会话历史加载**：`openSession` 同步切换主视图，会话历史随后在视图内加载；刚跳过去时可能短暂看到加载态。
