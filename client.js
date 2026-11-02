/**
 * Session Booth — client-side plugin.
 *
 * Registers a new `main` panel key ("splitview") plus a `sidebar.panellist`
 * entry. The panel renders a grid of n conversation panes, each bound to a
 * different session via an explicit SessionProvider. The session-id layout is
 * persisted in localStorage so the split view reopens on the next launch.
 */
window.__ModuleLoader__.load({
  id: '@local/session-booth',
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
          '[data-conversation-scroll] .viewArea { flex: 1 0 auto !important; min-height: auto !important }\n';
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
    function SplitPanel(props) {
      const { sessions, workspaces, layout, t, wsDisplay, SessionProvider, renderPane, uiWorkspace } = props

      const list = sessions.list.getSnapshot()
      const byId = list.byId || {}
      const available = (list.ids || []).map(id => byId[id]).filter(Boolean)

      const [picker, setPicker] = useState(null) // {mode:'initial'|'add', exclude:Set}
      const [paneRefs, setPaneRefs] = useState({}) // id -> {ref}

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
        const readAll = () => {
          scheduled = false
          const next = {}
          let changed = false
          for (const id of layout.ids) {
            const pane = paneRefs[id]
            const face = pane?.ref?.binding?.session
            if (!face) continue
            try {
              const s = face.getSnapshot()
              next[id] = {
                running: s.running,
                blank: s.blank,
                promptAttempted: s.promptAttempted,
                error: !!(s.lastAgentError || s.openError || s.promptError),
              }
              const prev = statusesRef.current[id]
              if (!prev || prev.running !== next[id].running || prev.blank !== next[id].blank ||
                  prev.promptAttempted !== next[id].promptAttempted || prev.error !== next[id].error) {
                changed = true
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

      const disabled = useMemo(() => new Set(layout.ids), [layout.ids])

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

      // Responsive grid: balance columns/rows by session count.
      // cols = ceil(sqrt(N)), rows = ceil(N/cols). This keeps the grid as
      // square as possible so removing/adding sessions reflows the panes
      // instead of overflowing a fixed 2x2 box.
      const n = layout.ids.length
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
      const rows = Math.max(1, Math.ceil(n / cols))

      // Empty state (no panes yet): show a centered "add sessions" affordance.
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

      return h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          height: '100%', width: '100%', gap: 1, background: 'var(--dsh-border, #333)',
        },
      },
        layout.ids.map(id => {
          const pane = paneRefs[id]
          return h('div', {
            key: id,
            style: { position: 'relative', overflow: 'hidden', background: 'var(--dsh-bg, #1e1e1e)', minWidth: 0 },
          },
            pane?.ref
              ? h(SessionProvider, { session: pane.ref },
                h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' } },
                  renderPane(pane.ref, id, {
                    onAdd: () => setPicker({ mode: 'add', exclude: disabled }),
                    onRemove: () => layout.remove(id),
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
                    onSwitch: (sessionId) => uiWorkspace.openSession(sessionId),
                    t,
                  }),
                ),
              )
              : h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, opacity: 0.5 } }, t('split.pickerEmpty')),
          )
        }),
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
            onCancel: () => { layout.dismiss(); setPicker(null) },
            onConfirm: (ids) => {
              // Both the initial pick and the edit ("+") dialog replace the
              // layout with the chosen set, so currently-selected sessions can
              // be unchecked (removed) as well as added.
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
      )
    }

    /**
     * One split pane: renders the conversation content factory for the bound
     * session (already established by the surrounding SessionProvider), plus
     * add/remove corner controls in the top-right.
     */
    function PaneContentBase({ renderFactorySlot, onAdd, onRemove, status, title, pillWidth, workspace, sessionTitles, sessionTitleOf, onJump, onSwitch, t }) {
      const [switchOpen, setSwitchOpen] = useState(false)

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
          // Top-left title as plain DSH-style breadcrumbs (matches the normal
          // DSH ConversationSessionHeader): workspace crumb / session crumb,
          // transparent background, no border box, no shadow.
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
              height: 26, position: 'relative',
            },
          },
            // Workspace name crumb (tertiary color). Click jumps to this session.
            h('button', {
              onClick: onJump,
              title: t('split.jump'),
              style: {
                display: 'inline-block', maxWidth: 220,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: 'var(--dsw-alias-label-tertiary, #999)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '4px 8px', fontSize: 14, lineHeight: '20px',
                borderRadius: 'var(--dsw-radius-md, 6px)', flexShrink: 0,
              },
            },
              h('span', { style: { whiteSpace: 'nowrap' } }, wsTitle || title || t('split.panelLabel')),
            ),
            // Separator (caption color).
            h('span', {
              style: {
                color: 'var(--dsw-alias-label-caption, #777)', fontSize: 14, lineHeight: '20px',
              },
            }, '/'),
            // Session name crumb (primary color, weight 500). Click opens switcher.
            hasSessionPart
              ? h('button', {
                onClick: (e) => { e.stopPropagation(); setSwitchOpen(v => !v) },
                title: t('split.switchSession'),
                style: {
                  display: 'inline-block', maxWidth: 220,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: 'var(--dsw-alias-label-primary, #eee)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '4px 8px', fontSize: 14, lineHeight: '20px',
                  fontWeight: 500, borderRadius: 'var(--dsw-radius-md, 6px)', flexShrink: 0,
                },
              },
                h('span', { style: { whiteSpace: 'nowrap', fontWeight: 500 } }, title || ''),
              )
              : null,
            // Workspace-switcher dropdown (anchored under the crumbs).
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
                    onClick: (e) => { e.stopPropagation(); onSwitch(sid); setSwitchOpen(false) },
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
              style: {
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--dsh-bg, #1e1e1e)', border: '1px solid var(--dsh-border, #333)',
                borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              },
            },
              h('button', {
                type: 'button',
                title: t('split.removeSession'), 'aria-label': t('split.removeSession'),
                onClick: (e) => { e.stopPropagation(); e.preventDefault(); onRemove() },
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
      )
    }

    /**
     * Colored status indicator. Derives state from the live SessionSnapshot:
     *  - error   -> red (lastAgentError / openError / promptError)
     *  - running -> green with a fade pulse animation
     *  - pending -> yellow (blank, never had a first turn)
     *  - done    -> solid green
     */
    function StatusDot({ status }) {
      const state = (() => {
        if (!status) return 'done'
        if (status.error) return 'error'
        if (status.running) return 'running'
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
          // Cancel: mark configured so the picker never auto-reopens, but
          // keep ids empty (no layout persisted yet).
          dismiss: () => { layout.initialized = true; layout.emit() },
          subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
          emit() { for (const fn of this.listeners) fn(this.ids) },
        }
        // Hydrate from localStorage (null = never configured).
        const stored = readStoredIds()
        layout.initialized = stored !== null
        if (stored !== null) layout.ids = stored

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
            useEffect(() => layout.subscribe(setIds), [])
            const { SessionProvider, renderFactorySlot } = props
            return h(SplitPanel, {
              sessions: ctx.sessions,
              workspaces: ctx.workspaces,
              layout: {
                ids,
                initialized: layout.initialized,
                set: layout.set,
                remove: layout.remove,
                addMissing: layout.addMissing,
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
            })
          })
        })
      },
    }
  },
})
