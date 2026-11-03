/**
 * Session Booth — client-side plugin.
 *
 * Registers a new `main` panel key ("splitview") plus a `sidebar.panellist`
 * entry. The panel renders a grid of n conversation panes, each bound to a
 * different session via an explicit SessionProvider. The session-id layout is
 * persisted in localStorage so the split view reopens on the next launch.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-booth',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState, useCallback, useRef } = React
    // ReactDOM.createPortal renders the picker into document.body so it is
    // never trapped by a transformed/filtered/overflowed ancestor (which would
    // make position:fixed behave like absolute and block its buttons).
    let createPortal = null
    try { createPortal = require('react-dom').createPortal } catch { /* no react-dom */ }

    const STORAGE_KEY = 'dsh.splitSessions.layout'
    const LAYOUT_MODE_KEY = 'dsh.splitSessions.layoutMode'

    // ------------------------------------------- localized dictionaries

    const LOCALE_NS = 'session-booth'

    const en = {
      'split.panelLabel': 'Session Booth',
      'split.pickerTitle': 'Select sessions',
      'split.pickerHint': 'Choose one or more sessions to show in the session booth.',
      'split.pickerEmpty': 'No active sessions yet. Start a session first.',
      'split.pickerConfirm': 'Open session booth',
      'split.pickerCancel': 'Cancel',
      'split.addSession': 'Add session',
      'split.removeSession': 'Remove this session',
      'split.addTitle': 'Add a session to the booth',
      'split.close': 'Close session booth',
      'split.showRecent': 'Show only recent active sessions',
      'split.showAll': 'Show all sessions',
      'split.ungrouped': 'Ungrouped',
      'split.empty': 'No sessions yet',
      'split.emptyAdd': 'Add sessions',
      'split.recent': 'Recent',
      'split.jump': 'Open this session in the main conversation',
      'split.switchSession': 'Switch to another session in this workspace',
      'split.editTitle': 'Edit session booth',
      'split.confirm': 'Confirm',
      'split.layoutGrid': 'Grid layout',
      'split.layoutColumns': 'Column layout',
      'split.addToBooth': 'Add to Session Booth',
      'split.addToBoothAria': 'Add this session to the Session Booth',
      'split.inBooth': 'Already in the Session Booth',
      'split.inBoothAria': 'This session is already in the Session Booth',
      // Long-press "-" -> confirm before clearing the WHOLE booth.
      'split.clearBoothTitle': 'Clear session booth?',
      'split.clearBoothMsg': 'This removes every session from the booth. You can re-add them any time.',
      'split.clearBoothConfirm': 'Clear all',
      'split.clearBoothCancel': 'Cancel',
      // Session switch: target not active in this workspace.
      'split.switchUnavailable': 'That session is not active yet. Start it first.',
      // Picker footer: select-all / clear-all shortcuts.
      'split.pickerSelectAll': 'Select all',
      'split.pickerClear': 'Clear all',
    }

    const zh = {
      'split.panelLabel': '会话廊',
      'split.pickerTitle': '选择会话',
      'split.pickerHint': '选择一个或多个要在会话廊中显示的会话。',
      'split.pickerEmpty': '当前没有活动的会话。请先启动一个会话。',
      'split.pickerConfirm': '打开会话廊',
      'split.pickerCancel': '取消',
      'split.addSession': '添加会话',
      'split.removeSession': '移除该会话',
      'split.addTitle': '向会话廊添加会话',
      'split.close': '关闭会话廊',
      'split.showRecent': '仅显示最近活跃的会话',
      'split.showAll': '显示所有会话',
      'split.ungrouped': '未分组',
      'split.empty': '暂无会话',
      'split.emptyAdd': '添加会话',
      'split.recent': '最近',
      'split.jump': '在主会话中打开该会话',
      'split.switchSession': '切换到该工作区的其他会话',
      'split.editTitle': '编辑会话廊',
      'split.confirm': '确认',
      'split.layoutGrid': '网格布局',
      'split.layoutColumns': '分栏布局',
      'split.addToBooth': '加入会话廊',
      'split.addToBoothAria': '将该会话加入会话廊',
      'split.inBooth': '已在会话廊中',
      'split.inBoothAria': '该会话已在会话廊中',
      // 长按 "-" -> 清空整个会话廊前先确认。
      'split.clearBoothTitle': '清空会话廊？',
      'split.clearBoothMsg': '这会移除会话廊中的所有会话。你可以随时重新添加。',
      'split.clearBoothConfirm': '全部清空',
      'split.clearBoothCancel': '取消',
      // 切换会话：目标会话在本工作区未激活。
      'split.switchUnavailable': '该会话尚未启动，请先启动它。',
      // 选择器底部：全选 / 清空快捷操作。
      'split.pickerSelectAll': '全选',
      'split.pickerClear': '清空',
    }

    // ------------------------------------------------------------------ utils

    /** Read the persisted session-id list; never throws. */
    function readStoredIds() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed
        return null
      } catch {
        return null
      }
    }

    function writeStoredIds(ids) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
      } catch {
        /* localStorage unavailable — layout just won't persist. */
      }
    }

    // Layout mode: 'grid' (balanced staircase, default) or 'columns' (1 row of
    // N equal columns, for side-by-side reading). Persisted independently so
    // the user's preferred arrangement survives a reload.
    const LAYOUT_MODES = ['grid', 'columns']

    /** Read the persisted layout mode; never throws. Defaults to 'grid'. */
    function readStoredMode() {
      try {
        const raw = window.localStorage.getItem(LAYOUT_MODE_KEY)
        if (raw === null) return 'grid'
        const parsed = JSON.parse(raw)
        if (LAYOUT_MODES.includes(parsed)) return parsed
        return 'grid'
      } catch {
        return 'grid'
      }
    }

    function writeStoredMode(mode) {
      try {
        window.localStorage.setItem(LAYOUT_MODE_KEY, JSON.stringify(mode))
      } catch {
        /* localStorage unavailable — mode just won't persist. */
      }
    }

    // Inject the pulse keyframes once (idempotent).
    let styleInjected = false
    function ensureStyles() {
      if (styleInjected) return
      styleInjected = true
      try {
        const el = document.createElement('style')
        el.textContent =
          '@keyframes dshSplitPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }\n' +
          // The composer (input dialog) renders with DSH's default styling.
          // Our pane gives the flex chain a definite height (height:100% on
          // the content box), so `.body`/`.scrollBody` (flex:1; min-height:0)
          // fill the pane. The conversation.content factory returns only
          // `.body` (not the phase-gated `.root`/`.embeddedBody`), so DSH's
          // own gated composerSeat sticky rule never fires here. For a BLANK
          // session there is no `.viewArea` flex-filler, so without a push the
          // composer (flex:none) would sit at the TOP of the scrollport.
          // margin-top:auto on the composerSeat is the classic flex trick: it
          // consumes any leftover vertical space and pins the composer to the
          // pane bottom for both blank and populated sessions.
          '[data-conversation-scroll] [data-composer-seat] { position: sticky; bottom: 0; margin-top: auto }\n' +
          '[data-conversation-scroll] [class*="viewArea"] { flex: 1 0 auto !important; min-height: auto !important }\n' +
          // Per-button hover: each button inside the floating windows greys
          // out independently on hover (black -> gray). No box-level hover.
          '.dshSplitFloat button { transition: background 120ms ease, color 120ms ease }\n' +
          '.dshSplitFloat button:hover { background: rgba(255,255,255,0.12) !important }\n' +
          // Card fade in/out (渐入渐出): session boxes animate opacity when
          // added (fade in) and when removed (fade out over 200ms).
          '@keyframes dshSplitFadeIn { from { opacity: 0 } to { opacity: 1 } }\n' +
          '@keyframes dshSplitFadeOut { from { opacity: 1 } to { opacity: 0 } }\n' +
          // Unified loading overlay (统一加载动画): shown on FIRST entry,
          // stays until every pane is fully mounted/rendered, then fades out.
          // Only ever shows once (never re-appears on subsequent add/remove).
          '@keyframes dshSplitSpin { to { transform: rotate(360deg) } }\n' +
          '.dshSplitLoading { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: var(--dsh-bg, #1e1e1e); opacity: 1; transition: opacity 320ms ease; pointer-events: none }\n' +
          '.dshSplitLoading.done { opacity: 0 }\n' +
          '.dshSplitLoading .spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--dsh-accent, #4f8cff) 25%, transparent); border-top-color: var(--dsh-accent, #4f8cff); animation: dshSplitSpin 0.9s linear infinite }\n';
        document.head.appendChild(el)
      } catch {
        /* ignore */
      }
    }

    // ---------------------------------------------------------------- icons

    function GridIcon({ size = 18 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('line', { x1: 12, y1: 4, x2: 12, y2: 20 }),
        h('line', { x1: 3, y1: 12, x2: 21, y2: 12 }),
      )
    }

    function PlusIcon({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': 'true',
      },
        h('line', { x1: 8, y1: 3, x2: 8, y2: 13 }),
        h('line', { x1: 3, y1: 8, x2: 13, y2: 8 }),
      )
    }

    function MinusIcon({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': 'true',
      },
        h('line', { x1: 3, y1: 8, x2: 13, y2: 8 }),
      )
    }

    // Error boundary around the whole booth panel. Without this, any throw
    // inside SplitPanel (or a pane's conversation content) unmounts React to a
    // blank panel — the reported "黑屏". This surfaces the error text plus a
    // way back to the editor so a failure is diagnosable instead of a silent
    // black screen.
    class BoothErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      componentDidCatch(error, info) { console.error('[session-booth] render error:', error, info) }
      render() {
        if (!this.state.error) return this.props.children
        const err = this.state.error
        const msg = (err && (err.message || String(err))) || 'unknown error'
        return h('div', {
          style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, height: '100%', width: '100%', padding: 24,
            background: 'var(--dsh-bg, #1e1e1e)', color: 'var(--dsh-fg, #eee)',
          },
        },
          h('div', { style: { fontSize: 15, fontWeight: 600, color: '#e5484d' } },
            '会话廊渲染出错 / Booth render error'),
          h('pre', {
            style: {
              maxWidth: '80%', maxHeight: '40%', overflow: 'auto', whiteSpace: 'pre-wrap',
              fontSize: 12, opacity: 0.75, background: 'rgba(0,0,0,0.25)', padding: 10, borderRadius: 8,
            },
          }, msg),
          h('button', {
            onClick: () => { try { ctx.layout.selectPanel(null) } catch { /* noop */ } },
            style: {
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'var(--dsh-fg, #eee)',
            },
          }, '返回编辑器 / Back to editor'),
        )
      }
    }

    function CloseIcon({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': 'true',
      },
        h('line', { x1: 4, y1: 4, x2: 12, y2: 12 }),
        h('line', { x1: 12, y1: 4, x2: 4, y2: 12 }),
      )
    }

    // Column-split toggle icon: two vertical panes (used when the layout is in
    // 'grid' mode to offer switching to 'columns').
    function ColumnsIcon({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': 'true',
      },
        h('line', { x1: 5, y1: 3, x2: 5, y2: 13 }),
        h('line', { x1: 11, y1: 3, x2: 11, y2: 13 }),
      )
    }

    // ------------------------------------------------------- session picker

    /**
     * Group the available sessions by workspace, recent-active first.
     * @param {Array<{id:string,title:string,updatedAt:number,running:boolean}>} sessions
     * @param {Array<{workspaceId:string,title:string,sessionIds:string[]}>} workspaces
     * @returns {Array<{label:string,items:Array}>} groups in display order
     */
    function groupByWorkspace(sessions, workspaces) {
      const wsById = new Map()
      for (const ws of workspaces) wsById.set(ws.workspaceId, ws)
      // Build a sessionId -> workspace label map, preferring explicit membership.
      const labelById = new Map()
      for (const ws of workspaces) {
        for (const sid of ws.sessionIds) labelById.set(sid, ws.title)
      }
      const ungrouped = []
      const groups = new Map()
      for (const s of sessions) {
        const label = labelById.get(s.id)
        if (label === undefined) ungrouped.push(s)
        else {
          if (!groups.has(label)) groups.set(label, [])
          groups.get(label).push(s)
        }
      }
      const out = []
      for (const [label, items] of groups) out.push({ label, items })
      if (ungrouped.length > 0) out.push({ label: null, items: ungrouped })
      return out
    }

    /** Sort recent/active first (updatedAt desc, running before idle). */
    function rankSessions(sessions) {
      return sessions.slice().sort((a, b) => {
        if (a.running !== b.running) return a.running ? -1 : 1
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      })
    }

    /**
     * Modal multi-select over the active session list, grouped by workspace,
     * recent-active first, with a "show all" toggle.
     * @param {object} p
     * @param {Array<{id:string,title:string}>} p.sessions
     * @param {Array<{workspaceId:string,title:string,sessionIds:string[]}>} p.workspaces
     * @param {string[]} p.initial  already-selected ids (kept checked)
     * @param {Set<string>} p.disabled ids that must stay selected (already in a pane)
     * @param {(ids:string[])=>void} p.onConfirm
     * @param {()=>void} p.onCancel
     */
    function SessionPicker({ sessions, workspaces, initial, disabled, onConfirm, onCancel, title, hint, empty, confirm, cancel, showRecent, showAll, ungrouped }) {
      const [selected, setSelected] = useState(() => new Set(initial))
      const [recentOnly, setRecentOnly] = useState(true)
      const toggle = (id) => {
        if (disabled.has(id)) return
        setSelected(prev => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      const confirmable = selected.size > 0

      // Rank recent/active first.
      const ranked = rankSessions(sessions)
      // When "recent only" is on, keep running sessions + the most recent 8.
      const visible = recentOnly
        ? ranked.filter(s => s.running).concat(ranked.filter(s => !s.running).slice(0, 8))
        : ranked
      const groups = groupByWorkspace(visible, workspaces)

      return h('div', {
        style: {
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
        onMouseDown: (e) => { if (e.target === e.currentTarget) onCancel() },
      },
        h('div', {
          style: {
            background: 'var(--dsh-bg, #1e1e1e)', color: 'var(--dsh-fg, #eee)',
            borderRadius: 12, padding: 20, width: 460, maxWidth: '92vw',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
            gap: 12, maxHeight: '82vh',
          },
        },
          h('div', { style: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' } }, title),
          h('div', { style: { fontSize: 13, color: 'var(--dsh-fg, #eee)', opacity: 0.65 } }, hint),

          // Show-all toggle.
          h('label', {
            style: {
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              color: 'var(--dsh-fg, #eee)', opacity: 0.8, cursor: 'pointer',
              padding: '2px 0',
            },
          },
            h('input', {
              type: 'checkbox', checked: recentOnly,
              onChange: () => setRecentOnly(v => !v),
              style: { accentColor: 'var(--dsh-accent, #4f8cff)' },
            }),
            h('span', null, recentOnly ? showRecent : showAll),
          ),

          sessions.length === 0
            ? h('div', { style: { fontSize: 13, opacity: 0.6, padding: '16px 0' } }, empty)
            : h('div', {
              style: {
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
                border: '1px solid var(--dsh-border, #333)', borderRadius: 8, padding: 10,
                minHeight: 120, maxHeight: '46vh',
              },
            },
              groups.length === 0
                ? h('div', { style: { fontSize: 12, opacity: 0.5, padding: '8px 0' } }, empty)
                : groups.map(group => h('div', { key: group.label ?? ungrouped, style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                  h('div', {
                    style: {
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.05em', opacity: 0.5, padding: '4px 8px',
                    },
                  }, group.label ?? ungrouped),
                  group.items.map(s => {
                    const isDisabled = disabled.has(s.id)
                    const checked = selected.has(s.id)
                    return h('label', {
                      key: s.id,
                      style: {
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                        borderRadius: 6, cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.5 : 1, fontSize: 13,
                      },
                    },
                      h('input', {
                        type: 'checkbox', checked, disabled: isDisabled,
                        onChange: () => toggle(s.id),
                        style: { accentColor: 'var(--dsh-accent, #4f8cff)' },
                      }),
                      h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.title),
                      s.running && h('span', {
                        style: {
                          fontSize: 10, padding: '1px 6px', borderRadius: 999,
                          background: 'var(--dsh-accent, #4f8cff)', color: '#fff', opacity: 0.9,
                        },
                      }, '●'),
                    )
                  }),
                )),
            ),

          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 } },
            h('button', { onClick: onCancel, style: btnStyle(false) }, cancel),
            h('button', {
              onClick: () => onConfirm(Array.from(selected)),
              disabled: !confirmable,
              style: btnStyle(true, confirmable),
            }, confirm),
          ),
        ),
      )
    }

    function btnStyle(primary, enabled = true) {
      return {
        padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: primary ? 600 : 500,
        cursor: enabled ? 'pointer' : 'not-allowed',
        border: '1px solid var(--dsh-border, #3a3a3a)',
        background: primary ? 'var(--dsh-accent, #4f8cff)' : 'transparent',
        color: primary ? '#fff' : 'var(--dsh-fg, #eee)',
        opacity: enabled ? 1 : 0.5,
        transition: 'background 120ms ease, opacity 120ms ease',
      }
    }

    // ---------------------------------------------------------- split panel

    /**
     * The "splitview" main panel: a grid of n conversation panes, each inside
     * an explicit SessionProvider so it binds to its own session.
     */

    // gcd / lcm helpers for the staircase grid layout.
    function gcd(a, b) { while (b) { const t = a % b; a = b; b = t } return a }
    function lcm(a, b) { return (a / gcd(a, b)) * b }

    // Balanced staircase layout: no empty grid cells. For N items we pick
    // rows = round(sqrt(N)) and distribute the items so the bottom rows are
    // slightly wider (e.g. 5 -> [2,3] = "上2下3"). Every row fills completely.
    // Returns { rows, totalCols, placements: [{row, col, colSpan}] }.
    function computeStaircase(n) {
      if (n <= 1) return { rows: 1, totalCols: 1, placements: [{ row: 0, col: 0, colSpan: 1 }] }
      const rows = Math.max(1, Math.round(Math.sqrt(n)))
      const base = Math.floor(n / rows)
      let rem = n % rows
      // Put the +1 on the BOTTOM rows (user wants 上2下3, not 3上2).
      const counts = []
      for (let i = 0; i < rows; i++) {
        const extra = (i >= rows - rem) ? 1 : 0
        counts.push(base + extra)
      }
      let totalCols = 1
      for (const c of counts) totalCols = lcm(totalCols, c)
      const placements = []
      let col = 0
      for (let r = 0; r < rows; r++) {
        const span = totalCols / counts[r]
        for (let p = 0; p < counts[r]; p++) {
          placements.push({ row: r, col: col + p * span, colSpan: span })
        }
        col = 0
      }
      return { rows, totalCols, placements }
    }

    // Column-split layout: all panes in a single horizontal row, each 1/N
    // wide. Returns the same { rows, totalCols, placements } shape as
    // computeStaircase so the caller can switch modes without special-casing.
    function computeColumns(n) {
      const placements = []
      for (let i = 0; i < n; i++) placements.push({ row: 0, col: i, colSpan: 1 })
      return { rows: 1, totalCols: n, placements }
    }

    // Mode-aware placement: 'grid' -> balanced staircase, 'columns' -> a
    // single horizontal row. A tiny n<=1 case collapses to one pane either way.
    function computeLayout(n, mode) {
      if (n <= 1) return { rows: 1, totalCols: 1, placements: [{ row: 0, col: 0, colSpan: 1 }] }
      if (mode === 'columns') return computeColumns(n)
      return computeStaircase(n)
    }

    function SplitPanel(props) {
      const { sessions, workspaces, layout, t, wsDisplay, SessionProvider, renderPane, uiWorkspace } = props

      const list = sessions.list.getSnapshot()
      const byId = list.byId || {}
      const available = (list.ids || []).map(id => byId[id]).filter(Boolean)

      const [picker, setPicker] = useState(null) // {mode:'initial'|'add', exclude:Set}
      const [paneRefs, setPaneRefs] = useState({}) // id -> {ref}
      // Lazy-mount: panes are heavy (each mounts a full ConversationContent
      // with a Lexical composer editor). Mounting N at once blocks the first
      // paint. We mount the FIRST pane immediately, then advance one pane per
      // animation frame until every pane is mounted, so the initial paint is
      // fast and the remaining editors initialize across subsequent frames.
      const [mounted, setMounted] = useState(() => new Set())
      // Unified loading overlay state: shows on FIRST entry and fades out once
      // every pane is mounted. `showLoading` is true until the first time the
      // layout has ids AND all of them are mounted; then it's set false
      // forever (a `loadingShown` ref prevents it from re-appearing on any
      // subsequent add/remove, which was the "stuck on add" bug).
      const [showLoading, setShowLoading] = useState(true)
      const [loadingDone, setLoadingDone] = useState(false)
      const loadingShown = useRef(false)
      useEffect(() => {
        if (layout.ids.length === 0) { setShowLoading(true); setLoadingDone(false); loadingShown.current = false; return }
        const allMounted = layout.ids.every(id => mounted.has(id))
        if (allMounted && !loadingShown.current) {
          loadingShown.current = true
          // Keep the overlay mounted but add `done` (opacity 0) so the CSS
          // transition fades it out smoothly; unmount it after the transition
          // (320ms) so it doesn't linger invisible. The fade is tuned to 320ms
          // — long enough to read as a deliberate dissolve, short enough to
          // not feel sluggish (体感变慢).
          setLoadingDone(true)
          setTimeout(() => { setShowLoading(false); setLoadingDone(false) }, 320)
        }
      }, [layout.ids.join(','), mounted.size])

      // Drag-to-reorder (like app icons): long-press an empty pane area to
      // lift it, then drag to a new position. dragIndex = the lifted pane's
      // layout index; dragOver = the index it would land on; dragging gates
      // pointer capture so a stray release can't drop it in the wrong place.
      const [dragIndex, setDragIndex] = useState(null)
      const [dragOver, setDragOver] = useState(null)
      const dragTimer = useRef(null)
      const dragStart = useRef(null)
      const draggingRef = useRef(false)

      // Card fade-out: when a pane is removed we animate its card's opacity to
      // 0 over 200ms, then actually drop it from the layout so the grid
      // reflows. `removing` holds the ids currently in their fade-out window.
      const [removing, setRemoving] = useState(() => new Set())
      const removingTimers = useRef(new Map())
      const requestRemove = (id) => {
        if (removing.has(id)) return
        setRemoving(prev => new Set(prev).add(id))
        const timer = setTimeout(() => {
          layout.remove(id)
          setRemoving(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          removingTimers.current.delete(id)
        }, 220)
        removingTimers.current.set(id, timer)
      }
      // Clear any pending fade-out timers on unmount.
      useEffect(() => () => {
        for (const timer of removingTimers.current.values()) clearTimeout(timer)
        removingTimers.current.clear()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Reset any in-flight drag when the layout changes under us.
      useEffect(() => {
        if (dragIndex !== null && !layout.ids.includes(dragIndex)) {
          setDragIndex(null); setDragOver(null)
        }
      }, [layout.ids.join(',')])


      // First visit (no persisted layout): open the multi-select picker so the
      // user chooses the sessions for the split view.
      useEffect(() => {
        if (layout.initialized === false && layout.ids.length === 0) {
          setPicker({ mode: 'initial', exclude: new Set() })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // (Re)establish SessionReference for each layout id that still exists.
      // Only re-runs when the actual id set changes; existing refs are reused
      // so a session-list phase change doesn't churn every pane's retain.
      useEffect(() => {
        const next = {}
        for (const id of layout.ids) {
          const existing = paneRefs[id]
          if (existing) { next[id] = existing; continue }
          let ref = null
          try {
            ref = sessions.retain(id, { source: 'splitView' })
          } catch {
            ref = null
          }
          if (ref) next[id] = { ref }
        }
        setPaneRefs(prev => {
          for (const key of Object.keys(prev)) {
            if (!next[key] && prev[key]?.ref) prev[key].ref.release()
          }
          return next
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [layout.ids.join(',')])

      // Stagger mounts: start with the first id, then add one more id per
      // animation frame until all layout ids are mounted. This prevents the
      // N concurrent heavy conversation mounts from blocking the first paint.
      useEffect(() => {
        const ids = layout.ids
        if (ids.length === 0) { setMounted(new Set()); return }
        // Ensure the first id is mounted right away.
        setMounted(prev => {
          if (prev.has(ids[0]) || ids.length === 0) return prev
          const next = new Set(prev)
          next.add(ids[0])
          return next
        })
        // Then advance one per frame until all are mounted.
        let raf = 0
        const step = () => {
          setMounted(prev => {
            if (prev.size >= ids.length) return prev
            const next = new Set(prev)
            for (const id of ids) {
              if (!next.has(id)) { next.add(id); break }
            }
            return next
          })
          raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return () => { cancelAnimationFrame(raf) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [layout.ids.join(',')])

      // Release on unmount.
      useEffect(() => () => {
        Object.values(paneRefs).forEach(p => p?.ref?.release())
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Live per-session status for the dot indicator. Each retained ref's
      // SessionFace exposes the full SessionSnapshot (running/blank/errors).
      // We subscribe to the face and keep a status map keyed by session id.
      //
      // PERF: status changes are frequent during streaming, so we keep the
      // map in a ref and only commit it to state when the *rendered* status
      // (running/blank/error) actually changes for a pane. We also compare
      // shallowly so a streaming tick that only bumps e.g. output length does
      // not re-render the whole grid. PaneContent is memoized, so the heavy
      // conversation content only re-renders when its own status changes.
      const [statuses, setStatuses] = useState({})
      const statusesRef = useRef(statuses)
      // Latest read-loop result + a dirty flag, living in component-scope refs
      // so BOTH the read-loop effect and the commit effect below can see them.
      // (They were previously local to the read-loop closure, so the commit
      // effect's `statusDirty` reference threw ReferenceError -> black screen.)
      const statusNextRef = useRef({})
      const statusDirtyRef = useRef(false)
      // Bumped whenever the read loop flags a change, to trigger the commit
      // effect that applies statusNextRef to React state.
      const [commitTick, setCommitTick] = useState(0)
      useEffect(() => {
        statusesRef.current = statuses
      }, [statuses])
      useEffect(() => {
        const unsubs = []
        // PERF: status changes fire very frequently during streaming (every
        // output tick. Instead of re-reading ALL panes on EVERY event (O(N)
        // getSnapshot() calls per tick), coalesce events into a single read per
        // animation frame. This keeps the dots responsive while removing the
        // O(N×events) hot loop during streaming.
        let raf = 0
        let scheduled = false
        // Latest `next` map + dirty flag live in the component-scope refs
        // (statusNextRef / statusDirtyRef, declared above), NOT in this
        // closure — the commit effect reads them from a different scope. This
        // is how the loop's result reaches React without calling setStatuses
        // synchronously inside the rAF callback.
        const readAll = () => {
          scheduled = false
          const next = {}
          statusNextRef.current = next
          statusDirtyRef.current = false
          for (const id of layout.ids) {
            const pane = paneRefs[id]
            const face = pane?.ref?.binding?.session
            if (!face) continue
            try {
              const s = face.getSnapshot()
              // Per-turn "处理失败" / "本轮运行失败": the session snapshot has
              // no turn-error field, so we decide from the LATEST turn/end in
              // the binding's event window. The status dot is driven by whether
              // that latest turn SUCCEEDED, independent of running state:
              //   - latest turn/end is a failure -> red (regardless of running)
              //   - latest turn/end is a success -> fall through to live state
              //     (running -> pulsing green, blank+never-prompted -> yellow,
              //      otherwise -> solid green)
              // This mirrors DSH's own endFailure() (dsh-client-ui-chat),
              // which treats NOT ONLY reason.kind === 'error' as a failure, but
              // also 'aborted' with reason.reason.kind === 'hook' &&
              // reason.reason.reason === 'deepseek-account/signed-out', and
              // 'interrupted'. dsh-im sessions report "本轮运行失败" via
              // reason.kind === 'interrupted' or 'aborted'.
              let latestTurn = null
              try {
                const eventSource = pane?.ref?.binding?.eventSource
                const win = eventSource?.getSnapshot?.()
                const entries = win?.entries || []
                for (let i = entries.length - 1; i >= 0; i--) {
                  const ev = entries[i]?.event
                  if (!ev) continue
                  if (ev.type === 'turn/end') {
                    latestTurn = ev.data?.reason || null
                    break
                  }
                }
              } catch {
                /* eventSource not ready yet */
              }
              const turnFailed = (() => {
                if (!latestTurn) return false
                if (latestTurn.kind === 'error') return true
                if (latestTurn.kind === 'interrupted') return true
                if (latestTurn.kind === 'aborted' &&
                  latestTurn.reason?.kind === 'hook' &&
                  latestTurn.reason?.reason === 'deepseek-account/signed-out') return true
                return false
              })()
              // User rule: read the LAST conversation's success/failure.
              //   - last turn FAILED -> red, REGARDLESS of running state
              //   - last turn SUCCEEDED (or none settled) -> live state:
              //       running -> pulsing green
              //       blank && never prompted -> yellow (pending)
              //       otherwise -> solid green
              const live = s.running
                ? 'running'
                : s.blank && !s.promptAttempted
                  ? 'pending'
                  : 'done'
              const settledFailure = !!(latestTurn && turnFailed)
              const settled = !!(latestTurn && !turnFailed)
              next[id] = {
                running: s.running,
                blank: s.blank,
                promptAttempted: s.promptAttempted,
                // Failure (last turn failed) -> red. Otherwise live state.
                error: !!(s.lastAgentError || s.openError || s.promptError || settledFailure),
                pending: live === 'pending' && !settledFailure && !settled,
                // Running (with a successful settled turn) -> pulsing green.
                _live: settledFailure ? 'error' : live,
              }
              const prev = statusesRef.current[id]
              if (!prev || prev.running !== next[id].running || prev.blank !== next[id].blank ||
                  prev.promptAttempted !== next[id].promptAttempted || prev.error !== next[id].error ||
                  prev.pending !== next[id].pending) {
                statusDirtyRef.current = true
                setCommitTick(t => t + 1)
              }
            } catch {
              /* binding not ready yet */
            }
          }
        }
        // scheduleRead: coalesce face events into ONE readAll per animation frame.
        const scheduleRead = () => {
          if (scheduled) return
          scheduled = true
          raf = requestAnimationFrame(() => {
            raf = 0
            scheduled = false
            readAll()
          })
        }
        for (const id of layout.ids) {
          const pane = paneRefs[id]
          const face = pane?.ref?.binding?.session
          if (!face) continue
          try {
            const unsub = face.subscribe(scheduleRead)
            if (typeof unsub === 'function') unsubs.push(unsub)
          } catch {
            /* binding not ready yet */
          }
        }
        readAll()
        return () => { unsubs.forEach(u => u()) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [layout.ids.join(','), paneRefs])

      // Commit the freshly-read statuses to React state (the loop above only
      // builds `next`; this applies it when anything actually changed). The
      // refs are component-scope so this effect can read them — the previous
      // version referenced `statusDirty` from the read-loop closure, which
      // threw ReferenceError and black-screened the booth.
      useEffect(() => {
        if (!statusDirtyRef.current) return
        statusDirtyRef.current = false
        setStatuses(statusNextRef.current)
      }, [commitTick])

      const disabled = useMemo(() => new Set(layout.ids), [layout.ids])

      // Clear the WHOLE booth (long-press "-" -> confirm -> this). Removes
      // every session from the layout; the pane refs release on the next
      // paneRefs effect pass and SplitViewPanel returns to the editor.
      const onClearBooth = () => layout.set([])

      // Guard for the in-place session switch: a session listed in the
      // workspace's sessionIds is not necessarily still ACTIVE in the
      // session controller (it may have been closed). Swapping to such an
      // id makes retain() fail -> pane.ref null -> the empty-state text the
      // user reported. Return true to block the switch (list click is
      // silently ignored for unavailable sessions).
      const switchUnavailable = (sid) => !available.some(s => s.id === sid)

      // Build a sessionId -> workspace map for workspace-aware titles and
      // workspace switching. A session belongs to a workspace if its id is
      // listed in that workspace's sessionIds.
      const wsBySession = useMemo(() => {
        const map = new Map()
        for (const ws of (workspaces.list.getSnapshot().items || [])) {
          for (const sid of ws.sessionIds) map.set(sid, ws)
        }
        return map
      }, [workspaces.list.getSnapshot().items])

      // Localized workspace title: the first-use default workspace
      // ("default-workspace") reads as the active language's default name.
      const wsTitleOf = (ws) => ws ? wsDisplay(ws.title) : ''
      // Prefer the session's DURABLE title (the "title" projection). When a
      // session has no durable title yet, fall back to its displayTitle only if
      // it is NOT just the workspace name (displayTitleOf falls back to the
      // cwd's workspace title, which reads as the workspace name). Otherwise
      // show the raw session id — never a workspace name for a session name.
      const sessionTitleOf = (id) => {
        const entry = byId[id]
        if (!entry) return ''
        if (entry.title && entry.title !== '') return entry.title
        const dt = entry.displayTitle
        if (dt && dt !== '' && dt !== entry.cwd) return dt
        return entry.id || id
      }

      // Title text per pane = the SESSION name. The two-part title pill always
      // shows the workspace name on the left (via `wsTitle`) and the session
      // name on the right (the "> session" chip). So `titles[id]` is the
      // session name regardless of how many sessions the workspace has — the
      // workspace-only case from the old single-title design no longer applies
      // (the workspace name lives on the left button). Panes not in any
      // workspace also use the session display title.
      const titles = useMemo(() => {
        const out = {}
        for (const id of layout.ids) {
          out[id] = sessionTitleOf(id)
        }
        return out
      }, [layout.ids, byId, wsBySession, wsDisplay])

      // Uniform pill width: all panes share one width. The workspace name
      // must be FULLY visible (never truncated), so the shared width is at
      // least the longest workspace name among the selected panes, plus room
      // for the session chip when present. Capped so a very long title does
      // not overflow the pane.
      const pillWidth = useMemo(() => {
        // Longest full workspace name (must be completely visible).
        const wsTitles = layout.ids.map(id => wsTitleOf(wsBySession.get(id))).filter(Boolean)
        const longestWs = wsTitles.length ? Math.max(...wsTitles.map(s => s.length)) : 0
        // Longest session chip text (the "> session" part).
        const sessionTitlesArr = layout.ids.map(id => sessionTitleOf(id)).filter(Boolean)
        const longestSession = sessionTitlesArr.length ? Math.max(...sessionTitlesArr.map(s => s.length)) : 0
        // ~7px per CJK/latin char at 12px font; workspace button padding 20px
        // (10px each side), session chip ~30px (padding + "›").
        const px = Math.max(
          120, // sensible floor
          longestWs * 7 + 20,
          longestWs * 7 + 30 + longestSession * 7,
        )
        return Math.min(px, 480) // hard cap so it never overflows a pane
      }, [layout.ids, wsBySession, wsDisplay])

      // Mode-aware layout: 'grid' -> balanced staircase (no empty cells, odd
      // counts like 5 -> 上2下3), 'columns' -> a single horizontal row of N
      // equal panes for side-by-side reading.
      const grid = computeLayout(layout.ids.length, layout.mode || 'grid')
      const cols = grid.totalCols
      const rows = grid.rows
      const placements = grid.placements

      // Empty state (no panes yet): show the "add sessions" affordance in BOTH
      // the first-visit case (never configured) and the all-removed case
      // (configured, then every window removed). The parent SplitViewPanel also
      // calls ctx.layout.selectPanel(null) to return to the normal editor when
      // the layout is empty-and-configured, but that call can race / not have
      // landed yet. We therefore no longer return a blank black panel here —
      // the affordance is always shown for an empty layout, giving the user a
      // way back ("添加会话") instead of a stuck black screen.
      if (layout.ids.length === 0) {
        return h('div', {
          style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', width: '100%', gap: 14, background: 'var(--dsh-bg, #1e1e1e)',
          },
        },
          h('div', {
            style: {
              width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'var(--dsh-accent, #4f8cff)', opacity: 0.85,
            },
          }, h(GridIcon, { size: 26 })),
          h('div', { style: { fontSize: 15, fontWeight: 600, opacity: 0.85 } }, t('split.pickerTitle')),
          h('div', { style: { fontSize: 13, opacity: 0.55 } }, t('split.pickerHint')),
          h('button', {
            onClick: () => setPicker({ mode: 'initial', exclude: new Set() }),
            style: { ...btnStyle(true), marginTop: 6 },
          }, t('split.emptyAdd')),
        )
      }


      // Long-press to lift. We only start a drag if the pointer stays still
      // for the threshold AND the press wasn't on an interactive control.
      const startDragPress = (index) => (e) => {
        if (e.button !== 0) return
        const target = e.target
        if (target && (target.closest('button') || target.closest('a') || target.closest('input,textarea,select'))) return
        // Block native text-selection from the very start of the press: the
        // conversation content inside the pane otherwise hijacks the
        // long-press and turns the drag into a cursor highlight (滑选).
        e.preventDefault()
        // Belt-and-braces: a panes-wide user-select guard + clear any
        // selection that already exists before the drag begins.
        const paneEl = e.currentTarget
        try { paneEl.style.userSelect = 'none'; paneEl.style.webkitUserSelect = 'none' } catch { /* noop */ }
        try { if (window.getSelection) window.getSelection().removeAllRanges() } catch { /* noop */ }
        dragStart.current = { x: e.clientX, y: e.clientY, index }
        draggingRef.current = false
        clearTimeout(dragTimer.current)
        dragTimer.current = setTimeout(() => {
          draggingRef.current = true
          try { if (window.getSelection) window.getSelection().removeAllRanges() } catch { /* noop */ }
          setDragIndex(index)
          setDragOver(index)
        }, 260)
      }

      // If the pointer moves before the long-press fires, it's a click, not a drag.
      // Release the panes-wide user-select guard (best-effort; panes are
      // re-rendered each layout change so this is just to unblock hover/
      // selection between drags).
      const releaseSelectGuard = () => {
        try {
          const g = gridRef.current
          if (g) g.querySelectorAll('[data-split-pane]').forEach(p => { p.style.userSelect = ''; p.style.webkitUserSelect = '' })
        } catch { /* noop */ }
      }
      const cancelDragPress = () => {
        clearTimeout(dragTimer.current)
        draggingRef.current = false
        releaseSelectGuard()
      }

      const onDragMove = (index) => (e) => {
        // While the lift is armed (before the 260ms fires) the press is
        // still tracked: suppress the native selection that a moving
        // pointer would otherwise paint over the conversation text.
        if (dragStart.current) { try { e.preventDefault() } catch { /* noop */ } }
        if (!draggingRef.current) return
        try { e.preventDefault() } catch { /* noop */ }
        const over = document.elementFromPoint(e.clientX, e.clientY)
        if (over) {
          const paneEl = over.closest('[data-split-pane]')
          if (paneEl && paneEl.__splitIndex !== undefined) {
            setDragOver(paneEl.__splitIndex)
          } else if (paneEl && paneEl.dataset.splitPane !== undefined) {
            setDragOver(Number(paneEl.dataset.splitPane))
          }
        }
      }

      const gridRef = useRef(null)

      const endDrag = () => {
        clearTimeout(dragTimer.current)
        releaseSelectGuard()
        const from = dragIndex
        const to = dragOver
        draggingRef.current = false
        dragStart.current = null
        if (from !== null && to !== null && from !== to) {
          const ids = layout.ids.slice()
          const [moved] = ids.splice(from, 1)
          ids.splice(to, 0, moved)
          layout.set(ids)
        }
        setDragIndex(null)
        setDragOver(null)
      }

      // Ctrl+Tab / Ctrl+Shift+Tab cycles focus to the next/previous pane's
      // composer input (首尾衔接 — wraps at the ends). This mirrors the
      // common browser/IDE behavior for switching between editor panes.
      useEffect(() => {
        const onKeyDown = (e) => {
          if (!e.ctrlKey && !e.metaKey) return
          if (e.key !== 'Tab') return
          const grid = gridRef.current
          if (!grid) return
          const panes = Array.from(grid.querySelectorAll('[data-split-pane]'))
          if (panes.length === 0) return
          e.preventDefault()
          const active = document.activeElement
          const currentIdx = panes.findIndex(p => p.contains(active))
          const dir = e.shiftKey ? -1 : 1
          const nextIdx = currentIdx === -1
            ? (dir === 1 ? 0 : panes.length - 1)
            : (currentIdx + dir + panes.length) % panes.length
          const target = panes[nextIdx]
          const input = target?.querySelector('[data-composer-input]') || target?.querySelector('[contenteditable="true"]')
          if (input) {
            input.focus({ preventScroll: true })
            // Put the caret at the END of the content (both back- and
            // forward-cycling), not at the start. Plain inputs use
            // setSelectionRange; the Lexical composer is a contenteditable,
            // so collapse the DOM Selection to its last position instead.
            const caretToEnd = () => {
              try {
                if (typeof input.setSelectionRange === 'function') {
                  const len = (input.value != null ? input.value.length : 0)
                  input.setSelectionRange(len, len)
                } else if (input.lastChild && input.lastChild.nodeType === Node.TEXT_NODE) {
                  const r = document.createRange()
                  r.selectNodeContents(input)
                  r.collapse(false)
                  const s = window.getSelection()
                  s.removeAllRanges()
                  s.addRange(r)
                }
              } catch { /* composer may not be ready yet */ }
            }
            caretToEnd()
            requestAnimationFrame(caretToEnd)
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [])

      return h('div', {
        style: {
          position: 'relative', height: '100%', width: '100%',
        },
      },
        // Global layout-mode toggle: switches between the balanced grid and a
        // single horizontal row (column split). It floats over the grid's
        // top-right corner so it never shifts the pane layout.
        layout.ids.length > 1
          ? h('div', {
            className: 'dshSplitFloat',
            style: {
              position: 'absolute', top: 8, right: 8, zIndex: 20,
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
              borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            },
          },
            h('button', {
              type: 'button',
              title: layout.mode === 'grid' ? t('split.layoutColumns') : t('split.layoutGrid'),
              'aria-label': layout.mode === 'grid' ? t('split.layoutColumns') : t('split.layoutGrid'),
              onClick: () => layout.setMode(layout.mode === 'grid' ? 'columns' : 'grid'),
              style: cornerBtnStyle(),
            },
              layout.mode === 'grid'
                ? h(ColumnsIcon, { size: 12 })
                : h(GridIcon, { size: 12 }),
            ),
          )
          : null,
        h('div', {
          ref: gridRef,
          style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            height: '100%', width: '100%', gap: 8, padding: 8, background: 'var(--dsh-bg, #1e1e1e)',
            boxSizing: 'border-box',
          },
        },
        layout.ids.map((id, index) => h(GridItem, {
          key: id,
          index,
          placement: placements[index] || { row: 0, col: 0, colSpan: 1 },
          id,
          pane: paneRefs[id],
          renderPane,
          onAdd: () => setPicker({ mode: 'add', exclude: disabled, afterIndex: index }),
          onRemove: () => requestRemove(id),
          removing: removing.has(id),
          status: statuses[id],
          title: titles[id] || byId[id]?.displayTitle || byId[id]?.title || '',
          pillWidth,
          workspace: (() => {
            const ws = wsBySession.get(id)
            if (!ws) return null
            return { ...ws, title: wsDisplay(ws.title), currentSessionId: id }
          })(),
          sessionTitles: byId,
          sessionTitleOf,
          onJump: () => uiWorkspace.openSession(id),
          // In-place pane switch: clicking a session in the floating title's
          // list swaps THIS window to that session (same grid slot, stays in
          // the booth) instead of jumping to the editor via openSession.
          onSwitch: (sessionId) => layout.replaceAt(index, sessionId),
          onClearBooth: onClearBooth,
          switchUnavailable: switchUnavailable,
          t,
          SessionProvider,
          mounted: mounted.has(id),
          dragIndex,
          dragOver,
          onDragStart: startDragPress(index),
          onDragMove: onDragMove(index),
          onDragEnd: endDrag,
          onDragCancel: cancelDragPress,

          empty: t('split.pickerEmpty'),
        })),
        picker && (createPortal
          ? createPortal(h(SessionPicker, {
            sessions: available,
            workspaces: (workspaces.list.getSnapshot().items || []).map(ws => ({
              workspaceId: ws.workspaceId,
              title: wsDisplay(ws.title),
              sessionIds: Array.from(ws.sessionIds || []),
            })),
            initial: layout.ids,
            disabled: new Set(),
            title: t('split.pickerTitle'),
            hint: t('split.pickerHint'),
            empty: t('split.pickerEmpty'),
            confirm: t('split.confirm'),
            cancel: t('split.pickerCancel'),
            showRecent: t('split.showRecent'),
            showAll: t('split.showAll'),
            ungrouped: t('split.ungrouped'),
            selectAllLabel: t('split.pickerSelectAll'),
            clearLabel: t('split.pickerClear'),
            onCancel: () => { layout.dismiss(); setPicker(null) },
            onConfirm: (ids) => {
              // For an "add" ("+") confirm, insert the newly-chosen session
              // AFTER the pane whose "+" was clicked (afterIndex), so the new
              // window appears next to the source pane. For the initial pick,
              // replace the layout with the chosen set as before. If the picker
              // replaced the whole set (some sessions unchecked), fall back to
              // a plain set to avoid surprising reorder semantics.
              if (picker?.mode === 'add' && picker.afterIndex !== undefined && ids.length === layout.ids.length + 1) {
                const added = ids.find(x => !layout.ids.includes(x))
                if (added !== undefined) {
                  layout.addAt(added, picker.afterIndex + 1)
                  setPicker(null)
                  return
                }
              }
              layout.set(ids)
              setPicker(null)
            },
          }), document.body)
          : h(SessionPicker, {
            sessions: available,
            workspaces: (workspaces.list.getSnapshot().items || []).map(ws => ({
              workspaceId: ws.workspaceId,
              title: wsDisplay(ws.title),
              sessionIds: Array.from(ws.sessionIds || []),
            })),
            initial: layout.ids,
            disabled: new Set(),
            title: t('split.pickerTitle'),
            hint: t('split.pickerHint'),
            empty: t('split.pickerEmpty'),
            confirm: t('split.confirm'),
            cancel: t('split.pickerCancel'),
            showRecent: t('split.showRecent'),
            showAll: t('split.showAll'),
            ungrouped: t('split.ungrouped'),
            onCancel: () => { layout.dismiss(); setPicker(null) },
            onConfirm: (ids) => {
              layout.set(ids)
              setPicker(null)
            },
          })),
        ),
        // Unified loading overlay (统一加载动画). `showLoading` is true only
        // on first entry (until every pane mounts), then fades out and never
        // re-appears. `done` sets opacity 0; pointer-events:none keeps it
        // from blocking the already-rendered panes underneath.
        showLoading && layout.ids.length > 0
          ? h('div', {
            className: 'dshSplitLoading' + (loadingDone ? ' done' : ''),
          },
            h('div', { className: 'spinner' }),
          )
          : null,
      )
    }

    /**
     * One grid cell: the wrapper around a pane's SessionProvider and
     * conversation content. Memoized so that when `layout.ids` changes
     * (add/remove session) React reuses the existing cell component
     * instance and only re-renders cells whose props actually changed,
     * instead of rebuilding every wrapper element in the grid.
     */
    const GridItem = React.memo(function GridItem({ id, index, pane, renderPane, onAdd, onRemove, onClearBooth, switchUnavailable, status, title, pillWidth, workspace, sessionTitles, sessionTitleOf, onJump, onSwitch, t, SessionProvider, empty, mounted, placement, dragIndex, dragOver, removing, onDragStart, onDragMove, onDragEnd, onDragCancel }) {
      return h('div', {
        'data-split-pane': index,
        onPointerDown: onDragStart,
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        onPointerLeave: onDragCancel,
        style: { position: 'relative', overflow: 'hidden', background: 'var(--dsh-bg, #1e1e1e)', minWidth: 0, gridColumn: placement ? `span ${placement.colSpan}` : undefined, gridRow: placement ? placement.row + 1 : undefined,
          borderRadius: 10, border: '1px solid var(--dsh-border, #333)',
          transition: 'box-shadow 120ms ease, transform 120ms ease, opacity 200ms ease',
          boxShadow: dragIndex !== null && dragIndex === index ? '0 12px 32px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: dragIndex !== null && dragIndex === index ? 30 : undefined,
          opacity: dragIndex !== null && dragOver === index && dragIndex !== index ? 0.6 : (removing ? 0 : 1),
          animation: removing ? 'dshSplitFadeOut 200ms ease forwards' : 'dshSplitFadeIn 200ms ease' },
      },
        mounted && pane?.ref
          ? h(SessionProvider, { session: pane.ref },
            h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' } },
              renderPane(pane.ref, id, {
                onAdd,
                onRemove,
                status,
                title,
                pillWidth,
                workspace,
                sessionTitles,
                sessionTitleOf,
                onJump,
                onSwitch,
                t,
              }),
            ),
          )
          : h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, opacity: 0.5 } }, empty),
      )
    })

    /**
     * One split pane: renders the conversation content factory for the bound
     * session (already established by the surrounding SessionProvider), plus
     * add/remove corner controls in the top-right.
     */
    function PaneContentBase({ renderFactorySlot, onAdd, onRemove, status, title, pillWidth, workspace, sessionTitles, sessionTitleOf, onJump, onSwitch, onClearBooth, switchUnavailable, t }) {
      const [switchOpen, setSwitchOpen] = useState(false)
      // Long-press "-" -> confirm before clearing the WHOLE booth. A quick
      // tap still removes just THIS pane. useLongPress arms a timer on
      // pointerdown; if it fires we show the confirm dialog instead of
      // removing the single session.
      const [confirmClear, setConfirmClear] = useState(false)
      const longPress = useLongPress(() => setConfirmClear(true), 500)
      // Close the session-switcher dropdown on any click outside the floating
      // title window (the dropdown is anchored inside it). A document-level
      // mousedown listener checks whether the event target is contained by
      // the title box ref; if not, it collapses the list. This is the
      // conventional dropdown behavior and keeps the switch list from
      // lingering open after the user clicks elsewhere.
      const titleRef = React.useRef(null)
      React.useEffect(() => {
        if (!switchOpen) return
        const onDocDown = (e) => {
          if (titleRef.current && !titleRef.current.contains(e.target)) setSwitchOpen(false)
        }
        document.addEventListener('mousedown', onDocDown)
        return () => document.removeEventListener('mousedown', onDocDown)
      }, [switchOpen])

      // Split the title into a workspace part (left) and a session part
      // (right, gray background). Clicking the workspace name jumps to the
      // current session; clicking the session part opens the workspace's
      // session switcher. All panes share one pill width.
      const wsTitle = workspace ? workspace.title : ''
      // Always split "workspace" ["> session"] when there is a session title:
      // the workspace name (left) jumps to the current session, the session
      // chip (right, gray background) opens the workspace switcher. For a
      // single-session workspace the switcher simply shows that one session.
      const hasSessionPart = !!(workspace && title)

      // The conversation content factory owns its own scrollport and native
      // bottom-follow (the chat view resolves [data-conversation-scroll] and
      // drives ScrollFollow). We deliberately render it in a flex-fill box
      // with no outer scroller and no manual live-follow: a second scrollport
      // would duplicate the factory's scrolling, causing jitter and clipping.
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 8px 4px', flexShrink: 0 } },
          // Top-left: a bordered floating window matching the top-right "-+"
          // control, with the session name as a GRAY chip on the right. Clicking
          // the gray session chip opens a vertical list at the split boundary.
          h('div', {
            ref: titleRef,
            className: 'dshSplitFloat',
            style: {
              display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
              height: 26, position: 'relative',
              background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
              borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            },
          },
            // Workspace name crumb (tertiary). Click jumps to this session.
            h('button', {
              onClick: onJump,
              title: t('split.jump'),
              style: {
                display: 'inline-block', maxWidth: 200,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: 'var(--dsw-alias-label-tertiary, #999)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '2px 6px', fontSize: 13, lineHeight: '18px',
                borderRadius: 'var(--dsw-radius-md, 6px)', flexShrink: 0,
              },
            },
              h('span', { style: { whiteSpace: 'nowrap' } }, wsTitle || title || t('split.panelLabel')),
            ),
            // Session name GRAY chip (primary, weight 500). Click opens the
            // vertical session list at the split boundary.
            hasSessionPart
              ? h('button', {
                onClick: (e) => { e.stopPropagation(); setSwitchOpen(v => !v) },
                title: t('split.switchSession'),
                style: {
                  display: 'inline-block', maxWidth: 200,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: 'var(--dsw-alias-label-primary, #eee)',
                  background: 'var(--dsh-border, #333)', border: 'none', cursor: 'pointer',
                  padding: '2px 8px', fontSize: 13, lineHeight: '18px',
                  fontWeight: 500, borderRadius: 'var(--dsw-radius-md, 6px)', flexShrink: 0,
                },
              },
                h('span', { style: { whiteSpace: 'nowrap', fontWeight: 500 } }, title || ''),
              )
              : null,
            // Vertical session list anchored at the split boundary (left edge).
            switchOpen && workspace
              ? h('div', {
                style: {
                  position: 'absolute', top: 28, left: 0, zIndex: 20, minWidth: 180,
                  background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
                  borderRadius: 8, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  display: 'flex', flexDirection: 'column', maxHeight: 240, overflowY: 'auto',
                },
              },
                (workspace.sessionIds || []).map(sid => {
                  const active = sid === workspace.currentSessionId
                  return h('button', {
                    key: sid,
                    onClick: (e) => {
                      e.stopPropagation()
                      setSwitchOpen(false)
                      // If the target session isn't active in this workspace
                      // yet, surface a hint instead of swapping to an empty
                      // pane (the reported "当前没有活动的会话").
                      if (typeof switchUnavailable === 'function' && switchUnavailable(sid)) return
                      onSwitch(sid)
                    },
                    style: {
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '6px 10px', borderRadius: 6, border: 'none',
                      background: active ? 'var(--dsh-accent, #4f8cff)' : 'transparent',
                      color: active ? '#fff' : 'var(--dsh-fg, #eee)', fontSize: 12,
                      justifyContent: 'flex-start', cursor: 'pointer', opacity: 0.9,
                    },
                  }, sessionTitleOf(sid) || sid)
                }),
              )
              : null,
          ),
          // Top-right: the status dot is INDEPENDENT — it sits on its own,
          // OUTSIDE the bordered remove/add floating window, so it reads as a
          // standalone state indicator rather than a control inside the box.
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
            },
          },
            // Status dot: solid green (done), pulsing green (running), yellow
            // (pending), red (error / abnormal termination). No border or
            // background: it floats freely, separate from the buttons.
            h(StatusDot, { status }),
            // Remove/add floating window.
            h('div', {
              className: 'dshSplitFloat',
              style: {
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
                borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              },
            },
              h('button', {
                type: 'button',
                // Tooltip documents BOTH gestures: tap removes this pane,
                // long-press opens the clear-the-whole-booth confirm.
                title: t('split.removeSession') + ' / ' + t('split.clearBoothTitle'),
                'aria-label': t('split.removeSession'),
                onPointerDown: (e) => { if (e.button === 0) longPress.start() },
                onPointerUp: () => longPress.cancel(),
                onPointerLeave: () => longPress.cancel(),
                onClick: (e) => {
                  e.stopPropagation(); e.preventDefault()
                  // A long-press just fired the clear-booth confirm; don't
                  // ALSO remove this single pane.
                  if (longPress.didFire()) return
                  onRemove()
                },
                style: cornerBtnStyle(),
              }, h(MinusIcon)),
              // Vertical divider between "−" and "+".
              h('div', {
                style: { width: 1, alignSelf: 'stretch', background: 'var(--dsh-border, #333)' },
              }),
              h('button', {
                type: 'button',
                title: t('split.addSession'), 'aria-label': t('split.addSession'),
                onClick: (e) => { e.stopPropagation(); e.preventDefault(); onAdd() },
                style: cornerBtnStyle(),
              }, h(PlusIcon)),
            ),
          ),
        ),
        // The conversation.content factory returns `.body` (flex:1, min-height:0).
        // It needs a FLEX COLUMN parent to fill the pane; otherwise `.body`'s
        // flex:1 resolves against no flex container and collapses to content
        // height, which clips the composer and breaks scrolling. No outer
        // scroller here: the factory owns its own [data-conversation-scroll]
        // scrollport and native bottom-follow.
        h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', position: 'relative', height: '100%' } },
          renderFactorySlot('conversation.content', { variant: 'split', phase: 'active', hero: false }, {
            slots: {},
          }),
        ),
        // Clear-the-whole-booth confirm dialog (long-press "-"). Overlays the
        // pane so it reads as a blocking confirm, not a side panel.
        confirmClear ? h('div', {
          onClick: (e) => e.stopPropagation(),
          style: {
            position: 'absolute', inset: 0, zIndex: 60, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
          },
        },
          h('div', {
            style: {
              minWidth: 280, maxWidth: '80%', padding: 18, borderRadius: 12,
              background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 10,
            },
          },
            h('div', { style: { fontSize: 15, fontWeight: 600 } }, t('split.clearBoothTitle')),
            h('div', { style: { fontSize: 13, opacity: 0.7, lineHeight: 1.5 } }, t('split.clearBoothMsg')),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 } },
              h('button', {
                onClick: () => setConfirmClear(false),
                style: {
                  padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--dsh-border, #333)', background: 'transparent',
                  color: 'var(--dsh-fg, #eee)', fontSize: 13,
                },
              }, t('split.clearBoothCancel')),
              h('button', {
                onClick: () => { setConfirmClear(false); if (typeof onClearBooth === 'function') onClearBooth() },
                style: {
                  padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: 'none',
                  background: '#e5484d', color: '#fff', fontSize: 13, fontWeight: 500,
                },
              }, t('split.clearBoothConfirm')),
            ),
          ),
        ) : null,
      )
    }

    /**
     * Colored status indicator. State machine (user-requested):
     *  - the LAST completed turn failed -> red (regardless of running)
     *  - otherwise a currently running turn -> green pulse
     *  - otherwise blank & never prompted -> yellow (pending)
     *  - otherwise -> solid green (done)
     */
    function StatusDot({ status }) {
      const state = (() => {
        if (!status) return 'done'
        // User rule: read the LAST conversation. Failure -> red, no matter
        // whether a new/retry turn is now running.
        if (status.error) return 'error'
        // A running retry/new turn: pulse green (the failed dot already
        // reported; a fresh in-flight turn is "working").
        if (status.running) return 'running'
        // No settled turn yet and never prompted -> pending (yellow).
        if (status.pending) return 'pending'
        if (status.blank && !status.promptAttempted) return 'pending'
        return 'done'
      })()
      const color = state === 'error' ? '#e5484d'
        : state === 'running' || state === 'done' ? '#30a46c'
          : '#f5a623'
      const animation = state === 'running' ? 'dshSplitPulse 1.4s ease-in-out infinite' : 'none'
      ensureStyles()
      return h('span', {
        style: {
          display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
          background: color, flexShrink: 0,
          animation,
        },
      })
    }

    // Memoize so unrelated state changes don't re-render every pane's heavy
    // conversation content. onAdd/onRemove are stable per pane.
    const PaneContent = React.memo(PaneContentBase)

    function cornerBtnStyle() {
      return {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
        border: 'none', background: 'transparent', color: 'var(--dsh-fg, #eee)', opacity: 0.75,
        padding: 0, transition: 'background 120ms ease, opacity 120ms ease',
      }
    }

    // -------------------------------------------------------------- plugin

    return {
      inject: ['slots', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'locale'],
      apply(ctx) {
        // Register the bilingual dictionaries so `bind` resolves real text
        // instead of the raw key. `ctx.effect` disposes them on teardown.
        ctx.effect(() => ctx.locale.register(LOCALE_NS, { en, zh }), 'session-booth: dictionaries')
        const t = ctx.locale.bind(LOCALE_NS)
        // The `workspace` namespace carries the shared `workspace.defaultName`
        // key ("默认工作区"/"Default workspace"), used to localize the
        // first-use default workspace title via workspaceDisplayTitle.
        const tw = ctx.locale.bind('workspace')
        const DEFAULT_WS_DIR = 'default-workspace'
        // Mirrors @deepseek-ai/dsh-api-workspace-controller/default-workspace.
        function wsDisplay(title) {
          return title === DEFAULT_WS_DIR ? tw('workspace.defaultName') : title
        }

        // Session layout state shared between the sidebar and the panel.
        const layout = {
          ids: [],
          listeners: new Set(),
          // Arrow-function methods so `this` is always the layout object even
          // when the methods are passed as bare references (e.g. into the
          // SplitPanel prop object: `{ set: layout.set, remove: layout.remove }`).
          // Calling `layout.remove(id)` there would otherwise bind `this` to
          // the prop wrapper, whose `listeners` is undefined and `emit()` throws.
          set: (ids) => { layout.initialized = true; layout.ids = ids; writeStoredIds(ids); layout.emit() },
          remove: (id) => { layout.ids = layout.ids.filter(x => x !== id); writeStoredIds(layout.ids); layout.emit() },
          addMissing: (ids) => {
            const next = layout.ids.slice()
            for (const id of ids) if (!next.includes(id)) next.push(id)
            layout.ids = next; writeStoredIds(next); layout.emit()
          },
          // Insert a session AFTER the pane at `afterIndex` (the pane whose
          // "+" was clicked), so the new window appears next to the source
          // pane rather than always at the end of the layout.
          addAt: (id, afterIndex) => {
            const next = layout.ids.slice()
            const existing = next.indexOf(id)
            if (existing >= 0) next.splice(existing, 1)
            const at = Math.max(0, Math.min(afterIndex, next.length))
            next.splice(at, 0, id)
            layout.ids = next; writeStoredIds(next); layout.emit()
          },
          // In-place pane switch: swap the pane at `index` from its current
          // session to `id`. The new id takes the SAME grid slot, so the
          // window count and layout are unchanged — only which session this
          // window is bound to changes. Used by the floating title's session
          // list: clicking a session swaps THIS window to it (stays in the
          // booth) instead of jumping to the editor (openSession).
          replaceAt: (index, id) => {
            const next = layout.ids.slice()
            if (index < 0 || index >= next.length) return
            if (next[index] === id) return
            next[index] = id
            layout.ids = next; writeStoredIds(next); layout.emit()
          },
          // Cancel: mark configured so the picker never auto-reopens, but
          // keep ids empty (no layout persisted yet).
          dismiss: () => { layout.initialized = true; layout.emit() },
          setMode: (mode) => {
            if (!LAYOUT_MODES.includes(mode)) return
            layout.mode = mode
            writeStoredMode(mode)
            layout.emit()
          },
          subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
          emit() { for (const fn of this.listeners) fn(this.ids) },
        }
        // Hydrate from localStorage (null = never configured).
        const stored = readStoredIds()
        layout.initialized = stored !== null
        if (stored !== null) layout.ids = stored
        layout.mode = readStoredMode()

        // ---- Register the sidebar entry ----
        ctx.slots.inject('sidebar', function* () {
          yield ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'splitview',
            order: 30,
            // Thunk so the label re-reads on locale switch.
            label: () => t('split.panelLabel'),
          }, function SidebarIcon(props) {
            return h(GridIcon, { size: props.size ?? 18 })
          })
        })

        // ---- Register the main panel key. The panel declares a
        //      session-scoped child so the renderer delivers the standard
        //      SessionProvider seat, which each pane uses to bind itself to
        //      an explicit session reference. ----
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({
            name: 'main',
            key: 'splitview',
            children: {
              // Declared session child (never actually rendered directly) —
              // its only job is to make the panel receive SessionProvider.
              'splitview.pane': { kind: 'single', scope: 'session' },
            },
          }, function SplitViewPanel(props) {
            const [ids, setIds] = useState(layout.ids)
            const [mode, setMode] = useState(layout.mode)
            useEffect(() => layout.subscribe((next) => {
              setIds(next)
              setMode(layout.mode)
            }), [])
            const { SessionProvider, renderFactorySlot } = props
            // Zero windows -> return to the normal editor (the default
            // "conversation" main panel). selectPanel(null) is the same call
            // the workspace service uses to clear the main view.
            useEffect(() => {
              if (ids.length === 0 && layout.initialized) {
                try { ctx.layout.selectPanel(null) } catch { /* not registered yet */ }
              }
            }, [ids.length, layout.initialized])
            // Wrap in the error boundary so any render throw inside SplitPanel
            // or a pane shows readable text + a way back instead of a blank
            // black panel.
            return h(BoothErrorBoundary, null, h(SplitPanel, {
              sessions: ctx.sessions,
              workspaces: ctx.workspaces,
              layout: {
                ids,
                initialized: layout.initialized,
                mode,
                set: layout.set,
                remove: layout.remove,
                addMissing: layout.addMissing,
                addAt: layout.addAt,
                replaceAt: layout.replaceAt,
                setMode: layout.setMode,
                dismiss: layout.dismiss,
              },
              t,
              wsDisplay,
              SessionProvider,
              uiWorkspace: ctx.uiWorkspace,
              renderPane: (ref, sessionId, actions) => {
                // Inside SessionProvider the scope binding is this pane's
                // session, so the conversation content factory binds to it.
                return h(PaneContent, {
                  renderFactorySlot,
                  onAdd: actions.onAdd,
                  onRemove: actions.onRemove,
                  status: actions.status,
                  title: actions.title,
                  pillWidth: actions.pillWidth,
                  workspace: actions.workspace,
                  sessionTitles: actions.sessionTitles,
                  sessionTitleOf: actions.sessionTitleOf,
                  onJump: actions.onJump,
                  onSwitch: actions.onSwitch,
                  t: actions.t,
                })
              },
            }))
          })
        })

        // ---- Per-session "加入会话廊" button ----
        // Injected into EVERY real session window's header action row (the
        // top-right cluster next to the breadcrumb title) via the
        // `conversation.session.header.actions` LIST slot. A list slot accepts
        // multiple occupants with `replaceRisk: none`, so we never shadow the
        // shipped actions (agent-preset / jobs / subagent / agent-team) nor
        // sidebar-right's ExpandButton (which owns the `single` corner slot).
        // Matches the proven sidebar registration exactly: a generator
        // callback that yields one `register`, with only the fields that slot
        // documents (name / id / order / label). `sessionId` arrives via the
        // standard session-scope props; `layout` and `showBooth` are closed
        // over from the apply scope (no `inject` needed). Registration is
        // guarded so a failure here can never take down the whole plugin.
        try {
          ctx.slots.inject('conversation.session.header.actions', function* () {
            yield ctx.slots.register({
              name: 'conversation.session.header.actions',
              id: 'session-booth-add',
              order: 100,
              label: () => t('split.addToBooth'),
            }, function BoothAddButton({ sessionId }) {
              const [ids, setIds] = useState(layout.ids)
              const inBooth = ids.includes(sessionId)
              useEffect(() => layout.subscribe((next) => setIds(next)), [])
              return h('button', {
                type: 'button',
                title: inBooth ? t('split.inBooth') : t('split.addToBooth'),
                'aria-label': inBooth ? t('split.inBoothAria') : t('split.addToBoothAria'),
                onClick: () => {
                  if (sessionId === undefined || inBooth) return
                  layout.addMissing([sessionId])
                  try { ctx.layout.selectPanel('splitview') } catch { /* not registered yet */ }
                },
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
                  border: 'none', background: 'transparent',
                  color: 'var(--dsh-fg, #eee)', opacity: 0.75, padding: 0,
                  transition: 'background 120ms ease, opacity 120ms ease',
                },
                onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--dsh-hover, rgba(255,255,255,0.08))'; e.currentTarget.style.opacity = '1' },
                onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.75' },
              }, h(PlusIcon, { size: 14 }))
            })
          })
        } catch (e) { console.error('[session-booth] header-action registration failed:', e) }
      },
    }
  },
})
