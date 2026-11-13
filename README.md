# dsh-notice

DeepSeek Harness 桌面版的 macOS 系统通知插件：agent **完成**、**提问**、**请求权限**、**出错**时，通过通知中心告知你。它装在 DSH 的 `desktop` profile 里，用 DeepSeek Harness 自己的 bundle 身份投递通知。

## 安装

桌面版必须用 **App 自带的 CLI**（版本与应用一致；全局 npm 的 `dsh` 可能更旧）：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/dsh-notice
```

或从 npm 安装：

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add @hanxu131/dsh-notice
```

安装后需要**完全退出并重启 DeepSeek Harness**（仅关闭窗口不够），插件才会加载。重启后打开「插件」页并进入 `@hanxu131/dsh-notice` 组合包页面，即可在描述与 `notice` 行列表之间看到设置；`notice` 行不再提供单独的「配置」入口。

> 安装/更新插件后，重启前 App 里不会出现该插件。想确认安装结果，可以看
> `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 是否包含
> `@hanxu131/dsh-notice`，以及 `~/.dsh/profiles/desktop/node_modules/@hanxu131/dsh-notice`
> 是否指向本项目。注意：`dsh --profile desktop --dump-config` **不可用**——桌面版 profile
> 由 Electron App 独占管理，CLI 会直接报
> `profile "desktop" is managed exclusively by the Electron application`。

## 配置项

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `notifyOnComplete` | boolean | `true` | agent 彻底空闲（不是每个 turn 结束）时通知 |
| `notifyOnQuestion` | boolean | `true` | agent 向你提问时通知 |
| `notifyOnApproval` | boolean | `true` | agent 请求权限时通知 |
| `notifyOnError` | boolean | `true` | agent 运行失败时通知 |
| `soundPolicy` | `smart` \| `all` \| `none` | `smart` | `smart`：完成静音、其余带系统提示音；`all`：全部带音；`none`：全部静音 |
| `redact` | boolean | `true` | 正文不含提示词原文、模型输出片段与完整命令 |
| `showSessionTitle` | boolean | `true` | 用会话标题作通知标题，关闭时固定为 `DeepSeek Harness` |
| `replaceBySession` | boolean | `true` | 同一会话最多保留一条通知，新通知顶掉旧的 |

配置是 **volatile** 的：设置页保存后立即生效，无需重启插件或 App。

设置页底部还有两个运维控件：

- **发送测试通知**：绕过前台抑制直接发一条通知，用于确认 macOS 授权是否正常。
- **通知权限状态**：显示 `Notification.permission`；不是 `granted` 时提示去「系统设置 → 通知 → DeepSeek Harness」开启。

## 行为细节

- **前台抑制**：DSH 窗口处于前台（`document.hasFocus()`）时不发任何通知。
- **子智能体不通知**：`origin === 'subagent'` 的会话被过滤。
- **同会话替换**：每个会话最多保留一条通知；不同会话之间互不覆盖。
- **点击通知**：把 DSH 窗口带到前台（跳转到具体会话是 M2，本期未实现）。
- **正文格式**：`<事件句子> · <项目目录名>`，例如 `已完成 · 3分12秒 · dsh-notice`。

## 已知限制

- **App 关闭后没有通知**：通知只在渲染进程里发；桌面 App 完全退出、或 Web UI 没打开时，不会有任何通知。
- **首条通知可能被系统吞掉**：macOS 的通知授权是系统级状态，与浏览器侧的 `Notification.permission` 不是一回事。授权尚未决定时，第一条通知会被静默丢弃；用设置页的「发送测试通知」确认一次即可。系统授权被拒后通知会被静默丢弃，而 `Notification.permission` 仍显示 `granted`。
- **依赖桌面 App 的安全上下文**：通知由 Electron 渲染进程以 DeepSeek Harness 的 bundle 身份投递；在普通浏览器里跑 `dsh web` 时，发送者会变成浏览器自己，而不是 DeepSeek Harness。
- **没有服务端兜底通道**：这是 [ADR 0001](docs/adr/0001-notification-channel.md) 的明确取舍——只保证身份正确、可点击、可前台抑制，不保证 App 退出后的送达。
- **子智能体会话不发通知**：`origin === 'subagent'` 的子会话被过滤，避免子任务完成时打扰你。
- **同一会话同时存在多个待处理交互时只通知一个**：`ctx.uiSession.sessionStatus` 每个会话只暴露优先级最高的一个 `pendingInteraction`（官方按 plan-review > question / approval 选择），因此同会话并发的其它交互不会各发一条通知。
- **点击通知只把窗口带到前台**：跳转到具体会话是 M2 的范围，本期只保留 `sessionId` 供后续实现。
- 需要 DSH `>=0.2.1-rc.1 <0.3.0-0`。

## 真机验收清单

1. 重启 App 后，「插件」页能看到 `@hanxu131/dsh-notice`，且 bundle 没有激活失败。
2. 打开 `@hanxu131/dsh-notice` 组合包页面，标题、开关、描述和 `notice` 行列表仍然保留，且描述与行列表之间可见 8 个字段、测试按钮与权限状态行。
3. `notice` 行不再显示「配置」控件，也不能进入独立的行配置页面。
4. 改任一字段 → `~/.dsh/profiles/desktop/cordis.patch.yml` 落盘，且不重启即时生效。
5. 点「发送测试通知」→ 出现发送者为 DeepSeek Harness 的横幅。
6. 窗口失焦时跑一个 >10s 的任务 → 收到「已完成」通知；窗口聚焦时同样任务 → 不收到。
7. `ask_user_question` 的询问 → 收到通知，问题卡片仍可正常回答。
8. 触发一次权限审批 → 收到通知，审批流程正常。
9. 制造一次运行失败 → 收到错误通知。
10. 同一会话连续两次通知 → 通知中心只保留最新一条。

## 开发

```bash
pnpm install
pnpm run build      # tsc（宿主半）+ 原样复制客户端半
pnpm test           # node --test（纯逻辑单测）
```

客户端半是**手写的经典脚本**（`src/client.js`，`window.__ModuleLoader__.load` 外壳），构建时原样复制为 `lib/client.js`，不经过任何打包器/转译器。原因见 [ADR 0002](docs/adr/0002-handwritten-client-bundle.md)。

## License

MIT
