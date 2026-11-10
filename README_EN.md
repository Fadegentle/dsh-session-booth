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
| 🏗️ Horizontal / Vertical | Shelf-style layout: horizontal = balanced multi-column grid that wraps (not 5-in-a-row), vertical = single-column stack; click icon to toggle instantly |
| 📏 Pane resize | Drag handles on the right/bottom edge of each pane to resize; auto-normalized and persisted |
| 🖱️ Drag to reorder | Drag a pane's title bar (or long-press its empty area) to lift it, drop on a target pane to reorder — highlighted on drop |
| ➕ Targeted add | The "＋" on a pane inserts the new window right after that pane |
| ⚙️ Per-pane controls | Top-right: status dot, remove (−), add (+) |
| 🏷️ Title bar | "Workspace / session" split: click the workspace name to jump to the current session, click the session name to switch sessions in that workspace |
| 📜 Live scrolling | Scrolls to bottom and follows streaming output; pauses while an input is focused |
| 🟢 Status dot | done=green, running=green pulse (even after a failed last turn — running retry shows green), pending=yellow (including prompted but first turn not settled), error=red |
| 💾 Persistence | Layout and layout mode stored in `localStorage`, restored after a DSH restart |
| 🚀 Lazy mounting | Each pane mounts on a staggered animation frame to avoid jank with many sessions |
| ⏳ Loading animation | A unified loading overlay on first entry, fades out when rendering completes |

## 📦 Installation

### Method 1: Plugin manager

Install the bundle via DSH's plugin manager:

```
plugin_manager install_bundle C:\\...\\session-booth
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
5. Use the 🏗️ / 📐 buttons at the grid's top-right to toggle **Horizontal / Vertical / Grid** layout.
6. Drag the translucent handles on each pane's right/bottom edge to resize it.
7. Drag a pane's title bar (or long-press its empty area) to lift it, then drop it onto another pane to reorder.
8. The split layout is restored automatically after a DSH restart.

## 🎨 Status dot colors

| Status | Color / animation |
| --- | --- |
| ✅ Done | solid green `#30a46c` |
| 🔄 Running | green fade in/out pulse (also shown when retrying after a failed last turn) |
| 🟡 Pending (no settled turn yet) | yellow `#f5a623` |
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
├── package.json         # dsh-session-booth manifest
├── icon.svg             # 24×24 grid icon
└── src/locale/
    ├── zh.json          # Chinese localization
    └── en.json          # English localization
```

## 📛 Naming

- English: **Session Booth**
- Chinese: **会话廊**

## ⚖️ License

MIT License. Free for personal and commercial use.