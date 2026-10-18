# M1 验收 Handoff

写于 2026-10-18 16:05。**重启 DeepSeek Harness 会终止写这份文档的那个 agent 会话**（agent 跑在 App 的宿主进程里）。重启后按本文继续。

## 现状

- 实现完成：4 个功能 commit + 1 个修复 commit，HEAD = `86d6b2e`。
- 已 link 安装进 `desktop` profile：`~/.dsh/profiles/desktop/node_modules/@hanxu131/dsh-notice` → 本项目；`dsh.profile.bundles` 末尾有 `@hanxu131/dsh-notice`。
- `lib/` 已构建，`lib/client.js` 与 `src/client.js` 逐字节一致。
- **尚未加载**：需要完全退出 App 再重开（关窗口不够，要 Cmd+Q / 菜单「退出」）。

## 重启后怎么继续

1. 重开 DeepSeek Harness，打开本项目（`dsh-notice`）的会话。
2. 告诉我「已重启」。我会按下表逐项验收并定位问题。

## 验收清单（逐项，失败就记现象）

| # | 操作 | 期望 |
|---|---|---|
| 1 | 侧边栏「插件」页找 `@hanxu131/dsh-notice` | 出现在已安装列表，**无激活失败提示** |
| 2 | 该 bundle → 行 `notice` → 配置 | 看到 8 项配置 + 「发送测试通知」+ 通知权限状态 |
| 3 | 点「发送测试通知」 | 弹出身份为 **DeepSeek Harness** 的横幅 |
| 4 | 把「使用会话标题」开关关掉再开，保存 | 通知标题随之变化；`~/.dsh/profiles/desktop/cordis.patch.yml` 出现对应 user 层覆盖；**不需要重启** |
| 5 | 让 agent 跑一段 >10 秒的任务，然后**切到别的 App** | 任务结束时收到「已完成 · N 秒」 |
| 6 | 让 agent 跑同样任务，**保持窗口在前台** | **不**收到通知 |
| 7 | 触发一次 `ask_user_question`（例如让 agent 问你一个问题），然后切走 | 收到「等待你回答 N 个问题」；回来切回会话，问题卡片**仍可正常回答** |
| 8 | 触发一次权限申请（需要审批的工具调用），切走 | 收到「请求权限：<工具名>」；审批流程正常 |
| 9 | 同一会话连续触发两次通知 | 通知中心里该会话只有**最新一条** |

## 失败时先看哪里

| 现象 | 排查 |
|---|---|
| 插件页报 bundle 激活失败 | `lib/client.js` 缺失或格式错；`tail -c 400 lib/client.js` 应看到 `exports.apply = apply` |
| 插件加载了但没有任何通知 | 先点「发送测试通知」。能弹 → 是事件订阅问题；不能弹 → 是系统授权问题（系统设置 → 通知 → DeepSeek Harness） |
| 通知能弹但标题是目录名 | 会话还没有 title projection；`dsh-experimental-session-titles-bundle` 是否启用，或等标题生成后重试 |
| 询问/审批卡片不出现 | 说明 waterfall 被劫持 —— 我们的处理器必须 `return next()`，检查 `src/client.js` 两个 `$on` 分支 |
| 配置页没有「配置」入口 | 行 id 必须是 `notice`，且 `Config` 字段必须是 volatile；用 `node -e` 检查 `lib/index.js` 的 `Config` 元数据 |

## 重新构建

```sh
cd /Volumes/WD-1T/00_Workspace/00_Active/CodeProject/dsh-notice
pnpm test          # 构建 + 38 项单测
```

改完 `src/` 后必须重新构建（profile 是 link 安装，直接读本项目 `lib/`），然后**重启 App** 才会重新加载。

## 已知限制（不是 bug）

- App 完全退出后不会通知（架构决定，见 ADR 0001）。
- 首次授权前发出的那条通知会被系统静默丢弃（`authorizationStatus: Denied … as none`），所以先点「发送测试通知」。
- 点击通知只把窗口带到前台；跳转到具体会话是 M2。
- 错误通知依赖宿主 `api-session/error`；工具级失败不单独发通知（避免刷屏）。
