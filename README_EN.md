# 🏛️ Session Booth

> A DeepSeek Harness (DSH) plugin that shows multiple sessions side by side in the main window, with a persisted layout.
>
> [中文版 README](./README.md) | [English](./README_EN.md)

---

## 📖 Overview

**Session Booth** 🏛️ adds a resident entry to the left sidebar so you can watch **n sessions at once** in the main window. Each session gets its own pane, ideal for monitoring multiple agent tasks in parallel.

## ✨ Features

| Feature | Description |
| --- | --- |
| 📌 Resident sidebar entry | Click **Session Booth** to enter the split view |
| 🎯 First-click multi-select | A session picker lets you check multiple sessions |
| 🔲 Split layout | Auto-balanced staircase grid (no empty cell for odd counts, e.g. 5 → 2 top + 3 bottom) |
| 📐 Column layout | One-click toggle to a single row of N equal columns (grid / column switch) |
| 🖱️ Drag to reorder | Long-press a pane's empty area to lift it, then drag to a target to reorder (like desktop icons) |
| ➕ Targeted add | The "＋" on a pane inserts the new window right after that pane |
| ⚙️ Per-pane controls | Top-right: status dot, remove (−), add (+) |
| 🏷️ Title bar | "Workspace / session" split: click the workspace name to jump to the current session, click the session name to switch sessions in that workspace |
| 📜 Live scrolling | Scrolls to bottom and follows streaming output; pauses while an input is focused |
| 🟢 Status dot | done=green, running=green pulse, pending=yellow, error=red |
| 💾 Persistence | Layout and layout mode stored in `localStorage`, restored after a DSH restart |
| 🚀 Lazy mounting | Each pane mounts on a staggered animation frame to avoid jank with many sessions |
| ⏳ Loading animation | A unified loading overlay on first entry, fades out when rendering completes |

## 📦 Installation

### Method 1: Plugin manager

Install the bundle via DSH's plugin manager:

```
plugin_manager install_bundle C:\...\session-booth
```

> If the default mirror (`registry.npmmirror.com`) returns `ERR_PNPM_NO_MATCHING_VERSION`, use the official registry instead:
>
> ```
> plugin_manager install_bundle <plugin-dir> --registry https://registry.npmjs.org
> ```

### Method 2: Manual placement

Place the entire `session-booth/` directory into DSH's plugin directory, then restart DSH.

## 🚀 Usage

1. Click the **Session Booth** icon in the left sidebar.
2. On first entry a picker appears: check the sessions you want, then click **Confirm**.
3. In each pane's title bar: click the "Workspace" name (left) to jump to the current session; click the "session" name to switch sessions in that workspace.
4. In each pane's top-right corner: **+** adds more sessions, **−** removes that session.
5. Use the 📐 button at the grid's top-right to switch between **Grid layout / Column layout**.
6. Long-press a pane's empty area to lift it, then drag to reorder.
7. The split layout is restored automatically after a DSH restart.

## 🎨 Status dot colors

| Status | Color / animation |
| --- | --- |
| ✅ Done | solid green `#30a46c` |
| 🔄 Running | green fade in/out pulse |
| 🟡 Pending (no first turn yet) | yellow `#f5a623` |
| 🔴 Unexpected termination / error | red `#e5484d` |

## 🧩 Compatibility

- **DSH version**: requires a version that provides `@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-ui-sidebar`.
- **Platform**: Web / Electron (client-side rendering).
- **No host dependencies**: client-only injection; host side is a no-op.

## 📁 File layout

```
session-booth/
├── client.js            # client logic (register slot, split grid, status dot, drag, layout mode)
├── index.js             # host no-op
├── cordis.patch.yml     # plugin insertion config
├── package.json         # @local/session-booth manifest
├── icon.svg             # 24×24 grid icon
└── src/locale/
    ├── zh.json          # Chinese localization
    └── en.json          # English localization
```

## 📝 Changelog

### v0.2.0

- ➕ Added **column layout** mode (single row of N columns), one-click toggle and persisted.
- 🖱️ Added **drag to reorder** (long-press the empty area to lift, drag to a target to swap).
- 🎯 Added **targeted add**: the "＋" on a pane inserts the new window right after that pane.
- 🟥 The status dot now detects "processing failed / this round failed" (`interrupted` / `aborted` sign-out), no longer missed.
- 🔽 The session-switch dropdown now **collapses on outside click**.
- 🔲 The staircase grid supports **odd counts** with no empty cell (5 → 2 top + 3 bottom).
- 🚀 Panes **lazy-mount** on staggered frames to avoid jank with many sessions.
- ⏳ A **unified loading overlay** on first entry, fades out when rendering completes.
- 🏷️ Title bar reworked as a "Workspace / session" floating window with hover effects.
- 📌 The composer is pinned to the very bottom of each pane (including the blank-session case).

### v0.1.0

- Initial release.
- Supports 1 / 2 / 4 split grid layout.
- Supports layout persistence (`localStorage`).
- Supports session picker, status dots, and live scroll-follow.

## 📛 Naming

- English: **Session Booth**
- Chinese: **会话廊**

## ⚖️ License

MIT License. Free for personal and commercial use.
