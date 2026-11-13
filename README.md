# dsh-notice

简体中文 | [English](README.en.md)

`@hanxu131/dsh-notice` 是 DeepSeek Harness 桌面版的 macOS 系统通知插件：agent 最终完成、向你提问、请求工具权限或运行失败时，通过系统通知中心提醒你；点击通知可以回到对应会话。插件装进 DSH 的 `desktop` profile，通知由 Electron 渲染进程以 DeepSeek Harness 的 bundle 身份投递，因此在通知中心里发送者显示为 DeepSeek Harness。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-4B6EF5)

## 特性

- 四类触发事件：最终完成、提问、请求权限、出错，各有独立开关。
- 「最终完成」按根会话与全部可观察本地子智能体聚合判定，并等待 2 秒静默窗口，子任务仍在运行时不会误报完成。
- 点击通知返回对应会话；无法跳转时静默降级为只把窗口带到前台，不弹错误。
- 前台抑制：DeepSeek Harness 窗口有焦点时不发通知。
- 子智能体会话不单独发通知；同一会话默认只保留一条通知，可在设置中关闭替换。
- 默认脱敏：正文不含提示词原文、模型输出片段与完整命令。
- 8 项配置保存后即时生效，无需重启；设置页可发送测试通知、查看通知授权状态。

## 环境要求

| 项目 | 要求 |
|---|---|
| 系统 | macOS（使用系统通知中心） |
| DSH | 桌面版 `>=0.2.1-rc.1 <0.3.0-0`，当前验证于 `0.2.2-rc.2` |
| 安装位置 | 必须装进 `desktop` profile，由桌面 App 的渲染进程投递 |
| 开发环境 | Node.js `^22.19.0` 或 `>=24`，pnpm |

## 安装

桌面版要使用 App 自带的 CLI（版本与应用一致），全局 npm 安装的 `dsh` 可能更旧，不要混用。推荐从源码安装，这样拿到的是仓库最新代码：

```bash
git clone https://github.com/ECHOUniverse/dsh-notice.git
cd dsh-notice

"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add link:"$PWD"
```

安装后必须完全退出并重新打开 DeepSeek Harness（只关窗口不够）。重启后打开「插件」页，进入 `@hanxu131/dsh-notice` 组合包页面，在描述与 `notice` 行列表之间即可看到设置。首次使用时点「发送测试通知」，按提示到「系统设置 → 通知 → DeepSeek Harness」允许通知。

也可以从 npm 安装；npm 上的发布版本可能落后于仓库最新提交，需要最新功能时用上面的 `link:` 方式：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add @hanxu131/dsh-notice
```

安装核对：重启后「插件」页应能看到该插件；也可检查 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 与 `node_modules/@hanxu131/dsh-notice` 软链。桌面版 profile 由 Electron App 独占管理，`dsh --profile desktop --dump-config` 不可用。

## 配置

8 项配置全部为 volatile，设置页保存后立即生效，无需重启插件或 App。设置页位于组合包页面内，底部还有「发送测试通知」（绕过前台抑制）与「通知权限状态」两个运维控件。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `notifyOnComplete` | boolean | `true` | agent 最终完成时通知（根会话与全部可观察本地子智能体都空闲且静默 2 秒） |
| `notifyOnQuestion` | boolean | `true` | agent 提问时通知 |
| `notifyOnApproval` | boolean | `true` | agent 请求权限时通知 |
| `notifyOnError` | boolean | `true` | agent 运行失败时通知 |
| `soundPolicy` | `smart` / `all` / `none` | `smart` | `smart`：完成静音、其余带系统提示音；`all`：全部带音；`none`：全部静音 |
| `redact` | boolean | `true` | 正文脱敏：不含提示词原文、模型输出片段与完整命令 |
| `showSessionTitle` | boolean | `true` | 用会话标题作通知标题；关闭时固定为 `DeepSeek Harness` |
| `replaceBySession` | boolean | `true` | 同一会话最多保留一条通知，新通知顶掉旧的 |

## 通知示例

通知标题默认取会话标题（取不到时退回项目目录名，再退回 `DeepSeek Harness`），正文形如「事件句子 · 项目目录名」。

| 事件 | 通知正文示例 |
|---|---|
| 最终完成 | `已完成 · 3 分 12 秒 · dsh-notice` |
| 提问 | `等待你回答 2 个问题 · dsh-notice` |
| 请求权限 | `请求权限：Bash · dsh-notice` |
| 出错 | `运行失败：E_TIMEOUT · dsh-notice` |

关闭 `redact` 后，权限与错误通知会额外带一行不超过 80 字符的细节；完成通知不带。

## 触发规则

| 事件 | 判定来源 | 规则 |
|---|---|---|
| 最终完成 | `api-session/status` 的 `running`、`ctx.sessions.list` 的父子关系、`ctx.uiSession.sessionStatus` 的 `pendingInteraction` | 根会话与全部可观察本地后代会话都不运行、子树内没有待处理交互，并连续静默 2000 ms；每个周期最多一条完成通知 |
| 提问 | `pendingInteraction.kind` 为 `question` / `plan-review` | 每个会话只暴露优先级最高的一个待处理交互 |
| 请求权限 | `pendingInteraction.kind === "approval"` | 同上 |
| 出错 | `api-session/error` | 正文使用结构化错误摘要 |

- 前台抑制：`document.hasFocus()` 为真时不发通知。
- 子智能体会话（`origin === 'subagent'`）不单独发通知，但会参与「最终完成」的聚合判定。
- 外部或远程 subagent 不在客户端可见范围内，不参与完成等待（见已知限制）。

## 点击通知

点击后固定三步：

1. 用通知携带的 `sessionId` 调用 `ctx.uiWorkspace.openSession(sessionId)`，把当前窗口主视图切到该会话。
2. 用 `window.focus()` 把窗口带到前台。
3. 关闭这条通知。

导航服务不可用、会话已归档或会话不存在时，跳过第 1 步，只执行 2、3，仅 `console.warn`，不弹错误提示。设置页的「发送测试通知」没有所属会话，点击时只把窗口带到前台并关闭通知。

## 已知限制

- App 完全退出、或 Web UI 没打开时没有通知；也没有服务端兜底通道。
- 首条通知可能被系统静默丢弃：macOS 系统授权与浏览器侧 `Notification.permission` 不是一回事，授权未决定前第一条会被吞；用设置页的测试通知确认一次。
- 依赖桌面 App 的安全上下文；在普通浏览器里跑 `dsh web` 时，通知发送者会变成浏览器，而不是 DeepSeek Harness。
- 子智能体会话不单独发通知；最终完成只等待可观察的本地后代，外部或远程 subagent 不等待。
- 同一会话同时只暴露优先级最高的一个待处理交互（`plan-review` > `question` / `approval`），并发的其它交互不会各发一条通知。
- 隐藏或最小化窗口时，点击通知不一定能把窗口恢复：插件只有渲染进程权限，没有显示或恢复窗口的 IPC。
- App 完全退出后，通知中心里的旧通知点击不会回调插件。
- 跳转不额外滚动或展开侧栏定位会话，也不等待会话历史加载，刚跳过去可能短暂看到加载态。
- 依赖 DSH 版本范围；npm 发布版本可能落后于仓库。

## 故障排查

- **完全收不到通知**：确认 App 在运行，查看设置页「通知权限状态」，点一次「发送测试通知」；仍无则到「系统设置 → 通知 → DeepSeek Harness」允许通知。窗口在前台时本来就会被前台抑制。
- **第一条通知没出现**：系统授权尚未决定，先发一次测试通知；`Notification.permission` 为 `granted` 不代表 macOS 系统层已授权。
- **通知发送者是浏览器**：你在普通浏览器里打开了 `dsh web`，不是桌面 App。
- **「插件」页看不到插件**：完全退出并重启 App 后再看；必要时核对 profile 的 `package.json` 与 `node_modules`。
- **点击通知不跳转**：目标会话可能已归档或不存在，或导航服务不可用；此时只会把窗口带到前台。
- **装的是旧版本**：npm 发布可能滞后，改用源码 `link:` 安装。

## 开发

```bash
pnpm install
pnpm run build      # tsc（宿主半）+ 原样复制客户端半
pnpm test           # 先构建，再跑 node --test
pnpm run typecheck
```

```text
src/index.ts    宿主半：只声明 8 项 volatile 配置
src/client.js   客户端半：会话事件聚合、发通知、渲染设置页（手写经典脚本）
lib/            构建产物（git 忽略）
tests/          node:test 单元测试
docs/           规格、ADR、研究记录
```

客户端半是手写的经典脚本（`window.__ModuleLoader__.load` 外壳），构建时原样复制为 `lib/client.js`，不经过打包器或转译器；原因见 [ADR 0002](docs/adr/0002-handwritten-client-bundle.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [CONTEXT.md](CONTEXT.md) | 术语与领域模型 |
| [M1 规格](docs/m1-spec.md) | 通知通道、四类触发与设置页 |
| [M2 规格](docs/m2-spec.md) | 点击通知跳转会话 |
| [全智能体完成规格](docs/all-agents-completion-spec.md) | 根会话 + 本地子智能体聚合完成判定 |
| [ADR 0001](docs/adr/0001-notification-channel.md) / [ADR 0002](docs/adr/0002-handwritten-client-bundle.md) / [ADR 0003](docs/adr/0003-pending-interactions-over-waterfall.md) | 通知通道、手写客户端、pending 观测的关键取舍 |

## 贡献

- 欢迎提交 Issue 与 PR：https://github.com/ECHOUniverse/dsh-notice/issues
- 改动前先跑 `pnpm run typecheck` 与 `pnpm test`。
- 客户端半保持手写经典脚本，不要引入打包器（见 [ADR 0002](docs/adr/0002-handwritten-client-bundle.md)）；不要提交 `lib/` 或本机 profile 路径。

## 真机验收

<details>
<summary>真机验收清单</summary>

1. 重启 App 后，「插件」页能看到 `@hanxu131/dsh-notice`，bundle 没有激活失败。
2. 打开组合包页面，标题、开关、描述和 `notice` 行列表仍然保留，并且描述与行列表之间可见 8 个字段、测试按钮与权限状态行。
3. `notice` 行不再显示「配置」控件，也不能进入独立的行配置页面。
4. 修改任一字段 → `~/.dsh/profiles/desktop/cordis.patch.yml` 落盘，且不重启即时生效。
5. 点「发送测试通知」→ 出现发送者为 DeepSeek Harness 的横幅。
6. 窗口失焦时跑一个超过 10 秒的任务 → 收到「已完成」通知；窗口聚焦时同样任务 → 收不到。
7. `ask_user_question` 的询问 → 收到通知，问题卡片仍可正常回答。
8. 触发一次权限审批 → 收到通知，审批流程正常。
9. 制造一次运行失败 → 收到错误通知。
10. 同一会话连续两次通知 → 通知中心只保留最新一条。
11. 窗口失焦时收到通知，点击横幅 → 主视图切到该通知所属会话、窗口到前台、通知关闭；四类事件各试一次。
12. 隐藏窗口（红叉 / Cmd+H）后点击通知 → 记录实际表现。
13. 最小化窗口后点击通知 → 记录实际表现。
14. 让一个会话产生通知后归档它，再点击该通知 → 只把窗口带到前台，不取消归档，无错误弹窗。
15. 点设置页「发送测试通知」→ 只把窗口带到前台，不切换主视图。
16. 主会话先结束、本地子智能体仍在运行时 → 不产生完成通知；全部结束后只产生一条。
17. 本地子智能体在等待提问或审批时 → 不产生父会话的完成通知；子智能体自己的提问或审批不单独发通知。

</details>

## License

MIT，见 [LICENSE](LICENSE)。
