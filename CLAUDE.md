# CLAUDE.md — session-booth 插件开发笔记

面向本仓库（`session-booth`，一个 DSH 客户端装饰插件）的开发/AI 协作约定与踩坑记录。
贡献代码前请先读这一节；约定与主 README 冲突时以本文件为准。

## 项目结构

- `client.js` — 客户端装饰主逻辑（booth 分屏、卡片点击跳转、sidebar 调度）。DSH 加载的是**安装副本** `~/.dsh/profiles/desktop/node_modules/@local/session-booth/client.js`。本机这份是**软链回 git 工作区**的，所以改完即时生效、md5 恒一致（`cp` 会报 "same file"，正常）；若哪天变成实体副本，就必须 `cp` 同步并用 md5 校验一致，否则测的是旧代码。
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

## 发布与上架

### 发新版（本仓库已自动化）

`.github/workflows/release.yml` 在 push `v*` tag 时自动跑：语法检查 → 校验 manifest → `npm pack` → 建 GitHub Release 并挂 tgz。所以发新版只需：

```sh
# 1. 改 package.json 的 version（如 0.3.8 → 0.3.9）
# 2. 提交并推送 main
git commit -am "chore: bump version to 0.3.9" && git push
# 3. 打 tag 触发 release
git tag -a v0.3.9 -m "v0.3.9" && git push origin v0.3.9
```

> 踩坑：`npm pack --pack-destination ./dist` **不会自动创建 `dist/`**，CI 上报 `ENOENT`。workflow 里已在 pack 前加了 `mkdir -p ./dist`，别删。

代理不稳时 push 偶发 `SSL_ERROR_SYSCALL`/`Connection was reset`，重试即可。注意 `git push 2>&1 | tail -1 && break` 这种写法里 `tail` 会吃掉 git 的退出码导致重试循环失效，要用 `${PIPESTATUS[0]}` 判断。

### 收录进插件市场（dsh-market）

市场本身（`dsh-market/dsh-market`）**不是收录入口**，别往它提 PR。列表数据在 **`awesome-dsh-plugin/awesome-dsh-plugin`** 的 `data/plugins/`，一个插件一个 YAML 文件。流程：

1. Fork `awesome-dsh-plugin`，开分支。
2. 新增 `data/plugins/<owner>__<repo>.yml`（只有 `description.en` 必填，`zh` 可留空让维护者补）：

   ```yaml
   url: https://github.com/owner/repo
   name: owner/repo
   category: session            # 见仓库 contributing.md 的分类表
   description:
     en: One-line description ending with a period.
     zh: 一句话描述，以句号结尾。
   icon: https://raw.githubusercontent.com/owner/repo/main/assets/icon-180.png
   tarball: https://github.com/owner/repo/releases/latest/download/<repo>.tgz   # 可选，装 release 包免确认
   ```

3. 跑 `npm ci && node scripts/generate-readme.mjs` 重新生成两个 README，**和条目文件一起提交**。
4. 提 PR，CI 绿后等维护者合并。

**三个硬性校验（踩过的坑）：**

- **icon 必须是位图**（png/jpg/webp），`.svg` 会被生成器拒。从 `icon.svg` 用 headless Chrome 导出 180×180 PNG 放 `assets/icon-180.png`：
  ```sh
  chrome --headless --disable-gpu --window-size=180,180 \
    --screenshot="$(pwd -W)/assets/icon-180.png" "file:///$(pwd -W)/tmp_icon.html"
  ```
  `tmp_icon.html` 是个 180×180 圆角深色底 + 居中 svg 的壳子，用完即删。
- **README 必须与 `data/plugins/` 同步**。分支基于旧 main 时 README 会过期，CI 的 `READMEs match data/plugins` 会挂——重新基于最新 main 生成再推。
- **仓库创建满 1 天**才能过 CI（自动检查，过滤 PR 前几分钟才建的仓库）。新建仓库当天提 PR 会红，等满 24h 再提即可。

### 上架后多久能搜到

PR 合并后，`awesome-dsh-plugin` 的两个 README 和 index 在 `main` 上自动重新生成；dsh-market 站点与市场索引随后抓取，**通常一天内**能在市场里搜到。合并后若想更快，确认 release 的 `latest/download/<repo>.tgz` 链接有效（市场可能用 tarball 加速安装）。
