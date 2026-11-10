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

## 📝 Changelog

### v0.3.7

- 🖱️ **Drag-to-reorder rewritten**: drag the pane's title bar to lift it instantly (no long-press needed — like grabbing a window title); long-press (220ms) anywhere else on the pane still lifts as before. The drop target gets a translucent highlight, and a stray click right after dropping is swallowed.
- 🔧 The drag engine moved to native capture-phase listeners on the grid container — DSH conversation components (Lexical editor etc.) that call `stopPropagation` on React events no longer swallow the gesture. Buttons, links, inputs and contenteditables no longer start a drag; text selection and typing are untouched, and title bars / resize strips are marked as priority gesture zones.

### v0.3.6

- 🔄 Long-press the layout toggle button (500ms) to restore default widths — all tracks reset to equal weight.
- 🏷️ Toggle button tooltips for all three states now read "Grid / Horizontal / Vertical" + "/Long-press to reset", with parenthetical descriptions removed.
- 📐 Fixed the toggle button's right-edge spacing to match the pane's "−+" float (both at 17px from the panel's right edge).
- 🐛 Fixed n=5 (and similar imperfect-fill) grid still showing "3 top + 2 bottom" with empty space: the v0.3.5 LCM change upgraded from 3 tracks to 6 tracks, but the old 3-element width array in localStorage was incorrectly reused for 6 tracks. `clampSizes` now resets to equal-width when the stored array length doesn't match the track count.

### v0.3.5

- 🔲 Fixed grid rows not filling the full width: the column count is now the LCM (least common multiple) of each row's pane count, so every row's panes tile the entire width with integer colSpan (5 sessions → 2 top spanning 50% each, 3 bottom spanning ~33% each — no more empty cells).

### v0.3.4

- 🗑️ Removed the guide UI (icon + title + "Add sessions" button) shown when no sessions are in the booth; the session picker now opens directly.
- 📌 The header "+" button toggles to "−" after adding a session; clicking it again removes the session. The toast is now an inline bubble next to the button instead of a fixed overlay at the screen corner.
- 🖱️ All buttons now have an `:active` pressed-state feedback (scale + darken), visually distinct from hover.

### v0.3.3

- 🐛 Fixed: the Session Booth could not be reopened after dismissing the picker or clearing all sessions (new `dismissed` flag is reset on open; the panel only returns to the editor when the user explicitly dismisses/clears).
- 📌 Clicking "Add to Session Booth" in a regular session window no longer jumps to the booth; instead a "Added to Session Booth" toast appears at the bottom-right.

### v0.3.2

- 🔲 Grid layout now **recalculates on every add/remove**: rows = largest square ≤ n (9→3 rows, 8→2, 6→2), evenly distributed per row, odd counts top-small bottom-large (7→3+4).
- 🐛 Fixed: adding sessions while selecting same-workspace sessions made them invisible (picker no longer disables already-displayed sessions — all sessions are selectable, and already-displayed ones can be toggled off).
- 🧹 Fixed "Clear all" not working: `onClearBooth` was not passed through `renderPane`; now wired correctly.
- 🖱️ Long-press "−" now shows a **full-booth overlay confirm** (not a single-pane popup); "−" tooltip reads "Remove this session / Long-press to clear all".
- ✏️ Session picker now has **Select all / Clear** buttons.

### v0.3.1

- 🔄 Fixed layout switching: the icon now cycles **Grid → Horizontal → Vertical → Grid** (three states; previously it looped only Horizontal↔Vertical and never returned to Grid). For perfectly-filled pane counts (4, 6, 9…) Horizontal takes one extra column so it no longer renders identically to Grid — which was the "only Grid and Vertical, no Horizontal" bug.

### v0.3.0

- 🏗️ Added **Horizontal / Vertical** shelf layout (horizontal = balanced multi-column grid that wraps, vertical = single-column stack), toggled instantly from the grid toolbar and persisted.
- 📏 Added **pane resizing**: drag the translucent handles on each pane's right/bottom edge; weights are auto-normalized and stored in `localStorage`.
- 🖱️ Drag-to-reorder now reads the pane index from the event's `currentTarget` instead of a `elementFromPoint` hit-test, making it much more reliable.
- 🟢 Status dot rule refined: a **running retry after a failed last turn now pulses green** instead of red; red only shows when the session is settled and the latest turn failed.
- 🟡 The pending (yellow) dot shows whenever a session is not running and has no settled turn (including prompted-but-first-turn-not-settled).

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
