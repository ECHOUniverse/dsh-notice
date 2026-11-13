# dsh-notice

English | [简体中文](README.md)

macOS system notifications for DeepSeek Harness desktop: when an agent **reaches final completion**, **asks a question**, **requests tool approval**, or **fails**, a Notification Center banner tells you. The plugin installs into the DSH `desktop` profile and delivers through the app's own bundle, so banners are attributed to DeepSeek Harness. Clicking one opens the session it came from.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.x-4B6EF5)

## Features

- Four trigger events, each with its own toggle.
- "Final completion" is aggregated over the root session and all observable local subagents, plus a 2-second quiet window, so a session whose subtasks are still running does not produce a false completion.
- Clicking a notification returns to the matching session. When navigation is unavailable it degrades silently to bringing the window forward, with no error dialog.
- Suppression: no notification while the DSH window has focus; subagent sessions never notify on their own; a session keeps at most one notification, which can be replaced.
- Redacted by default: bodies never contain prompt text, model output fragments, or full commands.
- Eight settings take effect as soon as they are saved, with no restart; the settings page can send a test notification and report the notification permission state.

## Requirements

| Item | Requirement |
|---|---|
| OS | macOS (system Notification Center) |
| DSH | desktop `>=0.2.1-rc.1 <0.3.0-0`; verified against `0.2.2-rc.2` |
| Install target | The `desktop` profile; delivery runs in the desktop app's renderer process |
| Development | Node.js ^22.19.0 \|\| >=24, pnpm |

## Installation

Use the CLI that ships with the desktop app. A globally installed `dsh` from npm may be an older version.

**Recommended: install from source**, which gives you the latest commit:

```bash
git clone https://github.com/ECHOUniverse/dsh-notice.git
cd dsh-notice

"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add link:"$PWD"
```

Restart DeepSeek Harness completely; closing the window is not enough. Then open **Plugins** and go to the `@hanxu131/dsh-notice` bundle page: the settings appear between the description and the `notice` row list.

**From npm (optional).** The published version may lag behind the repository; use the `link:` install above when you need the latest changes.

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add @hanxu131/dsh-notice
```

**Verifying the install:** after the restart the plugin shows up on the Plugins page. You can also check that `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json` lists `@hanxu131/dsh-notice`, and that `~/.dsh/profiles/desktop/node_modules/@hanxu131/dsh-notice` points at this project. Note that `dsh --profile desktop --dump-config` does not work: the desktop profile is managed exclusively by the Electron app. On first use, click **Send test notification** and, if prompted, allow notifications under **System Settings → Notifications → DeepSeek Harness**.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `notifyOnComplete` | boolean | `true` | Notify on final completion (root session and all observable local subagents idle, after 2 seconds of quiet) |
| `notifyOnQuestion` | boolean | `true` | Notify when the agent asks you a question |
| `notifyOnApproval` | boolean | `true` | Notify when the agent requests permission |
| `notifyOnError` | boolean | `true` | Notify when an agent run fails |
| `soundPolicy` | `smart` \| `all` \| `none` | `smart` | `smart`: silent on completion, sound otherwise; `all`: always sound; `none`: always silent |
| `redact` | boolean | `true` | Keep prompt text, model output fragments, and full commands out of the body |
| `showSessionTitle` | boolean | `true` | Use the session title as the notification title; when off it is always DeepSeek Harness |
| `replaceBySession` | boolean | `true` | Keep at most one notification per session; a new one replaces the old |

All eight settings are **volatile**: saving on the settings page applies them immediately, with no plugin or app restart. The page also offers **Send test notification** (bypasses foreground suppression) and a **notification permission** status line.

## Notification examples

The title defaults to the session title, falling back to the project directory name and then to DeepSeek Harness. The body has the form `<event sentence> · <project directory>`.

| Event | Notification body example |
|---|---|
| Final completion | `Completed · 3m 12s · dsh-notice` |
| Question | `Waiting for you to answer 2 questions · dsh-notice` |
| Approval | `Approval requested: Bash · dsh-notice` |
| Error | `Run failed: E_TIMEOUT · dsh-notice` |

With `redact` turned off, approval and error notifications carry one extra detail line of at most 80 characters. Completion notifications never do.

## Trigger rules

| Event | Decided from | Rule |
|---|---|---|
| Final completion | `running` from `api-session/status`, parent/child relations from `ctx.sessions.list`, `pendingInteraction` from `ctx.uiSession.sessionStatus` | Neither the root session nor any observable local descendant is running, no interaction is pending anywhere in the subtree, and quiet has lasted 2000 ms; at most one completion notification per cycle |
| Question | `pendingInteraction.kind` is `question` or `plan-review` | Each session exposes only its highest-priority pending interaction |
| Approval | `pendingInteraction.kind === "approval"` | Same as above |
| Error | `api-session/error` | The body uses the structured error summary |

- Foreground suppression: nothing is sent while `document.hasFocus()` is true.
- Subagent sessions (`origin === 'subagent'`) never notify on their own, though local subagents do take part in the completion aggregation; external and remote subagents are not observable and are not awaited (see [Known limitations](#known-limitations)).

## Clicking a notification

A click always does three things, in this order:

1. Call `ctx.uiWorkspace.openSession(sessionId)` with the session id carried by the notification, switching the current window's main view to that session.
2. Call `window.focus()` to bring the window forward.
3. Close the notification.

Degradation is silent: if the navigation service is unavailable, the session is archived, or the session no longer exists, step 1 is skipped, steps 2 and 3 still run, and only `console.warn` is logged, with no error dialog. The settings page's test notification has no session, so clicking it performs steps 2 and 3 only.

## Known limitations

- No notifications while the app is fully quit or the Web UI is not open; there is no server-side fallback channel.
- The first notification can be dropped silently: macOS system authorization is not the same thing as the browser-side `Notification.permission`, and anything sent before authorization is decided is swallowed. Confirm with the test notification.
- The desktop app's secure context is required. When `dsh web` runs in an ordinary browser, notifications are attributed to the browser instead of DeepSeek Harness.
- Subagent sessions never notify on their own; completion only waits for observable local descendants, not external or remote subagents.
- A session exposes a single pending interaction at a time, its highest priority (`plan-review` > `question` / `approval`), so other concurrent interactions do not each get a notification.
- Clicking a notification while the window is hidden or minimized may not restore it: the plugin has renderer-process privileges only and no IPC to show or restore a window.
- After the app has fully quit, old notifications still sitting in Notification Center do not call back into the plugin.
- Navigation does not scroll or expand the sidebar to the session, and does not wait for session history to load, so a brief loading state is expected right after switching.
- The plugin depends on a DSH version range, and the published npm version may lag behind the repository.

## Troubleshooting

- **No notifications at all** — confirm the app is running, check the notification permission status on the settings page, send a test notification, and allow notifications under System Settings → Notifications → DeepSeek Harness. A focused window suppresses them by design.
- **The first notification never appeared** — system authorization was still undecided; send a test notification once. `Notification.permission` being `granted` does not mean macOS has authorized the app.
- **The sender is a browser** — you are running `dsh web` in an ordinary browser, not the desktop app.
- **The plugin is missing from the Plugins page** — quit the app completely and reopen it, then look again; if needed, check the profile's `package.json` and `node_modules`.
- **Clicking a notification does not navigate** — the target session may be archived or gone, or the navigation service is unavailable; the window is only brought forward.
- **An old version is installed** — the npm release may lag; reinstall from source with `link:`.

## Development

```bash
pnpm install
pnpm run build      # tsc (host half) + copies the client half verbatim
pnpm test           # builds first, then runs node --test
pnpm run typecheck
```

```text
src/index.ts    host half: declares the eight volatile settings only
src/client.js   client half: session aggregation, notification delivery, settings UI (hand-written classic script)
lib/            build output (git-ignored)
tests/          node:test unit tests
docs/           specs, ADRs, research notes
```

The client half is a hand-written classic script (the `window.__ModuleLoader__.load` wrapper). The build copies it verbatim to `lib/client.js`, without a bundler or transpiler; the rationale is in [ADR 0002](docs/adr/0002-handwritten-client-bundle.md).

## Documentation

| Document | Contents |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Terminology and domain model |
| [M1 spec](docs/m1-spec.md) | Notification channel, the four triggers, and the settings page |
| [M2 spec](docs/m2-spec.md) | Navigating to a session by clicking a notification |
| [All-agents completion spec](docs/all-agents-completion-spec.md) | Aggregated completion over the root session and local subagents |
| [ADR 0001](docs/adr/0001-notification-channel.md) / [ADR 0002](docs/adr/0002-handwritten-client-bundle.md) / [ADR 0003](docs/adr/0003-pending-interactions-over-waterfall.md) | Key trade-offs: notification channel, hand-written client, pending interaction observation |

The specs and ADRs are written in Chinese.

## Contributing

Issues and pull requests are welcome at <https://github.com/ECHOUniverse/dsh-notice/issues>.

- Run `pnpm run typecheck` and `pnpm test` before changing anything.
- Keep the client half a hand-written classic script; do not introduce a bundler (see [ADR 0002](docs/adr/0002-handwritten-client-bundle.md)).
- Do not commit `lib/` or local profile paths.

## Manual acceptance

<details>
<summary>Checklist for a real desktop install (17 checks)</summary>

1. After restarting the app, `@hanxu131/dsh-notice` appears on the Plugins page and the bundle has not failed to activate.
2. On the bundle page, the title, toggles, description, and `notice` row list are still present, and the eight fields, the test button, and the permission status line are visible between the description and the row list.
3. The `notice` row no longer shows a configuration control and has no separate row settings page.
4. Changing any field writes `~/.dsh/profiles/desktop/cordis.patch.yml` and takes effect without a restart.
5. **Send test notification** produces a banner whose sender is DeepSeek Harness.
6. Run a task longer than 10 seconds with the window unfocused: a "Completed" notification arrives. Run the same task with the window focused: none arrives.
7. A question from `ask_user_question` produces a notification, and the question card can still be answered.
8. An approval request produces a notification, and the approval flow still works.
9. A forced run failure produces an error notification.
10. Two notifications in a row for the same session leave only the latest one in Notification Center.
11. With the window unfocused, clicking a banner switches the main view to that session, brings the window forward, and closes the notification; try all four event types.
12. Click a notification while the window is hidden (red button or Cmd+H) and record the actual behaviour.
13. Click a notification while the window is minimized and record the actual behaviour.
14. Let a session produce a notification, archive it, then click the notification: only the window is brought forward, the session is not unarchived, and no error dialog appears.
15. Clicking **Send test notification** on the settings page only brings the window forward and does not switch the main view.
16. With the main session finished and a local subagent still running, no completion notification is produced; once everything finishes, exactly one is.
17. When a local subagent is waiting on a question or approval, no completion notification is produced for the parent session, and the subagent's own question or approval is not notified separately.

</details>

## License

[MIT](LICENSE)
