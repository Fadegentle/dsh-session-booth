# CLAUDE.md — session-booth 插件开发笔记

面向本仓库（`session-booth`，一个 DSH 客户端装饰插件）的开发/AI 协作约定与踩坑记录。
贡献代码前请先读这一节；约定与主 README 冲突时以本文件为准。

## 项目结构

- `client.js` — 客户端装饰主逻辑（booth 分屏、卡片点击跳转、sidebar 调度）。DSH 加载的是**安装副本** `~/.dsh/profiles/desktop/node_modules/dsh-session-booth/client.js`，不是 git 工作区副本。**每次改完必须 cp 同步并用 md5 校验一致**，否则测的是旧代码。
- `index.js` — 插件入口/注册。
- `cordis.patch.yml` — DSH MCP/模型加载补丁（只在 DSH 启动时读一次；YAML 语法错误会导致 DSH 启动崩溃，编辑前备份、改完校验）。

## 关键机制：卡片点击跳转 + better-sidebar

booth 面板里两类卡片，点击都应「跳到该会话自己的主窗口 + 展开右侧 better-sidebar 显示文件/diff」：

- **present 卡片**（已展示文件）：`onClickCapture` 里 `closest('[data-presented-file]')` → 预览 `<button title=绝对路径>` → `presentInMain(sessionId, abs)`。路径在 DOM `title` 属性里，可直接读。
- **changes 卡片**（已编辑 N 个文件）：`closest('[data-changed-files]')`。**`seq`/`turn` 在 React 组件 props 闭包里，不在 DOM**，所以要读 fiber。两条路径：
  - PRIMARY `changesAddressFromFiber(el, sessionId)`：沿 `__reactFiber$*` 往 `.return` 走，找到 `memoizedProps.changes` 持有 `seq`/`turn` 的祖先，拼 `dsh-resource://changes-review/session/<sid>/<seq>/<turn>`。
  - FALLBACK：patch `sidebarRightRef.openResource` 捕获卡片原生调用 + 重新 dispatch click。

### 踩坑：GridItem 作用域拿不到 `uiWorkspace`

changes 分支最初直接写 `uiWorkspace.openSession(id)`，运行时报 `TypeError: uiWorkspace is not defined`。
原因：`uiWorkspace` 是 `SplitPanel` 从 props 解构的（`presentInMain`/`onJump` 在 SplitPanel 作用域内能用），
但卡片点击逻辑在 `GridItem` 组件里，`GridItem` 没有 `uiWorkspace` 这个 prop。

**修法**：改用 `GridItem` 已解构的 `onJump`（SplitPanel 传入的 `() => uiWorkspace.openSession(id)`，闭包已绑定本 pane 的 session id，和跳转按钮用的是同一条通路）。即 `onJump()` 而非 `uiWorkspace.openSession(id)`。

> 通用教训：装饰插件里跨组件作用域调用 DSH service 时，优先复用父组件已通过 props 下发的回调（`onJump`/`onPresent`），
> 不要假设任意 service（`uiWorkspace`/`sidebarRight` 等）在子组件作用域都可见。`sidebarRight` 之所以能用是因为它被显式存进了模块级 `sidebarRightRef`。

## 调试方法：打包 Electron renderer 里的运行时诊断

打包后的 DSH renderer 里 `console.log` 基本读不到（DevTools Console 能看，但定位 UI 问题时不直观）。
排查卡片点击这类「点了有没有命中/拿到什么值」的问题，临时用**固定定位的 DOM 覆盖层**把诊断顶到屏幕上：

```js
// TEMP DEBUG — 用完即删，不要提交
function boothDebug(msg) {
  try {
    let el = document.getElementById('booth-debug-overlay')
    if (!el) {
      el = document.createElement('div')
      el.id = 'booth-debug-overlay'
      el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:900px;' +
        'background:rgba(20,20,20,0.94);color:#7CFC7C;font:13px/1.5 monospace;padding:10px 14px;' +
        'border:2px solid #0F0;border-radius:6px;pointer-events:none;white-space:pre-wrap;'
      document.body.appendChild(el)
    }
    el.textContent = String(msg)
  } catch (err) { }
}
```

用法与注意：

- 在 `onClickCapture` 关键分支插 `boothDebug('[changes] addr=' + ...)`，点击卡片后直接在屏幕上读值。
- 浮层**只进 DOM、不进日志**，所以一次**真正的 renderer 重载**会把它清掉——这一点反过来可以当「有没有重载成功」的探针。
- 定位放在 `bottom:80px; left:50%`（底部居中）比顶部右上角好：右上角会被窗口控制按钮（最小化/关闭）遮挡裁切。
- **验证完必须把 `boothDebug` 函数和所有调用点全删掉**（`grep -c boothDebug` 应为 0），不要带进正式交付。

### 重载 DSH renderer 的可靠办法

`Ctrl+R` 在 DSH 里**没有注册**，按了不会重载（浮层不清空就是没重载的铁证）。可靠做法：

1. `Ctrl+Shift+I` 打开 DevTools（会以独立窗口弹出）。
2. 切到 **Console** 标签。
3. 点 console 输入行，输入 `location.reload()` 回车。
