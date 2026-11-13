# dsh-notice

macOS system notifications for DeepSeek Harness desktop: when an agent **completes**, **asks a question**, **requests approval**, or **fails**, a notification appears in Notification Center. It installs into the DSH `desktop` profile and delivers with DeepSeek Harness's own bundle identity. Clicking a notification opens the corresponding session in the main view.

A full English README will follow; see [README.md](README.md) for the complete documentation (Chinese).

## Install

```bash
dsh plugin --profile desktop add link:/Volumes/WD-1T/00_Workspace/00_Active/CodeProject/dsh-notice
```

Restart DeepSeek Harness completely (closing the window is not enough) after installing.

## License

MIT
