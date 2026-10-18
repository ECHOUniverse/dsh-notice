# M1 实现规格：dsh-notice

状态：待实现（M1 也就是本期验收范围）。上下文见 [CONTEXT.md](../CONTEXT.md) 与 [ADR 0001](adr/0001-notification-channel.md) / [ADR 0002](adr/0002-handwritten-client-bundle.md)。

## 产品行为

**触发事件**（四类，各自开关，默认全开）：

| 触发 | 客户端来源 | 文案（脱敏模式） |
|---|---|---|
| 最终完成 | `api-session/status` 变为 `running === false` | `已完成 · <耗时>` |
| 询问 | `ctx.uiSession.sessionStatus` 的 `pendingInteraction.kind` 为 `question` / `plan-review` | `等待你回答 <n> 个问题` |
| 权限 | 同源的 `pendingInteraction.kind === 'approval'` | `请求权限：<工具名>` |
| 错误 | `api-session/error` | `运行失败：<错误码或首句>` |

**为什么不用 waterfall**：`user-questions/request` 与 `approval/request` 会被官方 UI 插件 claim（返回答案即终止链路），而第三方插件行排在 profile 末尾，监听器永远收不到。触发源因此改为 `uiSession.sessionStatus`，详见 [ADR 0003](adr/0003-pending-interactions-over-waterfall.md)。

**判定与抑制**：

- **最终完成** = agent 彻底空闲（`api-session/status` 的 `running=false` 即宿主 `agent/status → idle`），不是每个 turn 结束。不设时长阈值。
- **前台抑制**：`document.hasFocus() === true` 时不发任何通知。
- **子智能体会话不发通知**（`SessionSummary.origin === 'subagent'` 过滤）。
- **同会话替换**：每个会话最多保留一条通知。自己保存 `Notification` 引用，发新通知前 `close()` 旧的；**不要依赖 `tag`**（macOS 上不保证）。
- 通知对象必须被强引用持有（脚本级 `Map<sessionId, Notification>`），否则会被回收并从通知中心消失。

**文案与内容**（Q15 = b + 跟随 locale）：

- `title` = 会话标题（`showSessionTitle` 关闭时用 `DeepSeek Harness`）
- `body` = `<事件句子> · <项目目录名>`（项目名取会话 `cwd` 的 basename）
- `silent` 由 `soundPolicy` 决定：`smart` → 完成静音、其余带系统默认音；`all` → 全带音；`none` → 全静音
- `redact=true`（默认）时**不得**包含提示词原文、模型输出片段、完整命令；`redact=false` 时可在错误/权限通知里附一行截断摘要（≤80 字符）

**点击**：`window.focus()` 把桌面窗口带到前台。跳转到具体会话是 M2，本期不实现，但代码里保留 `sessionId` 的传递。

## 配置字段（全部 `.volatile()`，宿主半 `Config`）

| 字段 | 类型 | 默认 |
|---|---|---|
| `notifyOnComplete` | boolean | true |
| `notifyOnQuestion` | boolean | true |
| `notifyOnApproval` | boolean | true |
| `notifyOnError` | boolean | true |
| `soundPolicy` | `'smart' \| 'all' \| 'none'` | `'smart'` |
| `redact` | boolean | true |
| `showSessionTitle` | boolean | true |
| `replaceBySession` | boolean | true |

全部为顶层标量——`SettingsFormModel` 只支持顶层字段，不要引入嵌套。

## 插件形态（双半）

```
package.json   dsh.bundle.patch + dsh.client{platform:'web'} + exports["./client"]
cordis.patch.yml   insert: [{ id: notice, name: '@hanxu131/dsh-notice', config: {...默认值} }]
src/index.ts   宿主半：name/'inject'/Config/apply（apply 可以为空，或只做 ctx.effect 占位）
src/client.js  客户端半：手写 __ModuleLoader__ 外壳（ADR 0002），构建时复制为 lib/client.js
```

- 宿主半用 `tsc` 编译，`Config` 必须是 **schemastery**（`@deepseek-ai/schemastery` 的 `z.object`），字段逐个 `.volatile()`，否则设置表单不会出现。
- **不要给客户端半引入任何打包器**；它必须保持 `window.__ModuleLoader__.load({ id: '<npm 包名>', factory: (require) => {…} })` 的经典脚本体，`exports.apply/inject` 由 `module.exports` 暴露。
- row id 固定为 `notice`；所有客户端 key 必须与之对齐（`<包名>#notice`）。
- `engines.dsh` 参考 `AutoTitle_DSH`：`>=0.2.1-rc.1 <0.3.0-0`（本机桌面版 0.2.1-rc.2 必须满足）。

## 设置界面

1. **主编辑页**：`ctx.slots.inject('plugins.row.config', …)` 注册 keyed 槽，`key = '@hanxu131/dsh-notice#notice'`；页面组件从 `props.form` 拿 `state`（`value`/`user`/`revision`/`writable`）与 `mutate`，`props.view === 'summary'` 时渲染一行摘要（如 `4 类通知已开启`）。
2. **运维控件**（Q20）：页面底部一块
   - 「发送测试通知」按钮 → 直接 `new Notification('dsh-notice test', {...})`，绕过前台抑制
   - 「通知权限状态」→ 显示 `Notification.permission`；非 `granted` 时提示「系统设置 → 通知 → DeepSeek Harness」
3. 表单组件从 `require('@deepseek-ai/dsh-client-ui-primitives')` 取（`SettingsForm`、`ConfigField`/`Switch` 等）。baseline 表里已有，无需 `dsh.client.external`。
4. 文案用 `ctx.locale.register(NS, { zh, en })` 双语，跟随 DSH locale。

## 实现时必须先确认的 API 细节（含退路）

| 未决点 | 怎么确认 | 退路 |
|---|---|---|
| 客户端取会话标题 | `dsh-session-title` 声明了 projection `title: string \| null`；查客户端 projection/`ctx.remote` 的取法 | 用会话 `cwd` 的 basename；再不行用固定 "DeepSeek Harness" |
| `ctx.remote.$on('api-session/status')` 载荷形状 | 读 `dsh-client-ui-*` 里现成用法 | 无（必须确认，这是完成通知的唯一来源） |
| `ctx.configForms.get(entryId)` 形状 | 读 `dsh-client-ui-settings-shell` 的 `SettingsFormModel` 用法 | 直接用 `props.form` |
| `Notification.close()` 是否可用 | 浏览器标准 API，Electron 支持 | 不替换，只追加 |
| `plugins.item` 是否对第三方 bundle 渲染 | 真机看插件页 | 只做 `plugins.row.config`；必要时补 `plugins.bundle.config`（key = 包名，需自己 `ctx.configForms.get`） |

## 验收清单（真机）

- [ ] `git init`；`pnpm run build` 通过；`node --test tests/*.test.mjs` 通过
- [ ] `dsh plugin --profile desktop add link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/dsh-notice` 成功
- [ ] 完全退出并重启桌面版后，插件出现在「插件」页，bundle 未报激活失败
- [ ] Configure 页可见 8 个字段 + 测试按钮 + 权限状态
- [ ] 改任一字段 → `~/.dsh/profiles/desktop/cordis.patch.yml` 落盘且**不重启生效**
- [ ] 点「发送测试通知」→ 弹出身份为 DeepSeek Harness 的横幅
- [ ] 窗口**失焦**时跑一个 >10s 的任务 → 收到「已完成」通知
- [ ] 窗口**聚焦**时完成同一任务 → **不**收到通知
- [ ] `ask_user_question` 触发的询问 → 收到通知，且 Web 上问题卡片仍可正常回答
- [ ] 触发一次权限询问（如需要审批的 bash）→ 收到通知，审批流程正常
- [ ] 制造一次运行失败 → 收到错误通知
- [ ] 同一会话连续两次通知 → 通知中心只留最新一条
