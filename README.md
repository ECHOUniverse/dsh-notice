# dsh-notice

DeepSeek Harness 桌面版的 macOS 系统通知插件：agent **完成**、**提问**、**请求权限**、**出错**时，通过通知中心告知你。它装在 DSH 的 `desktop` profile 里，用 DeepSeek Harness 自己的 bundle 身份投递通知。

## 安装

```bash
dsh plugin --profile desktop add link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/dsh-notice
```

或从 npm 安装：

```bash
dsh plugin --profile desktop add @hanxu131/dsh-notice
```

安装后需要**完全退出并重启 DeepSeek Harness**（仅关闭窗口不够），插件才会加载。重启后打开「插件」页，在 `@hanxu131/dsh-notice` 的 `notice` 行点「配置」即可打开设置页。

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
- **首条通知可能被系统吞掉**：macOS 的通知授权是系统级状态，与浏览器侧的 `Notification.permission` 不是一回事。授权尚未决定时，第一条通知会被静默丢弃；用设置页的「发送测试通知」确认一次即可。
- **没有服务端兜底通道**：这是 [ADR 0001](docs/adr/0001-notification-channel.md) 的明确取舍——只保证身份正确、可点击、可前台抑制，不保证 App 退出后的送达。
- 需要 DSH `>=0.2.1-rc.1 <0.3.0-0`。

## 开发

```bash
pnpm install
pnpm run build      # tsc（宿主半）+ 原样复制客户端半
pnpm test           # node --test（纯逻辑单测）
```

客户端半是**手写的经典脚本**（`src/client.js`，`window.__ModuleLoader__.load` 外壳），构建时原样复制为 `lib/client.js`，不经过任何打包器/转译器。原因见 [ADR 0002](docs/adr/0002-handwritten-client-bundle.md)。

## License

MIT
