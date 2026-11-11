# Markdown Paste (LaTeX Fix) for Zotero

把从 **DeepSeek / ChatGPT / Claude** 网页版复制出来的 Markdown，连同 `\(...\)`、`\[...\]` 公式，
直接粘进 Zotero 笔记：公式自动变成 Zotero 原生公式节点，标题、列表、表格、加粗一并保留。

- 适用：Zotero 7 / 8 / 9 / 10（在 **Zotero 10.0.8 + Windows** 上完成全链路实测）
- 许可：MIT
- 无外部依赖、不联网（`markdown-it` 已内置）

---

## 它解决什么问题

把网页内容粘进 Zotero 笔记，原本会踩三个坑：

1. **Zotero 只认 `$...$` / `$$...$$`**。DeepSeek 复制出来的是 `\(...\)` / `\[...\]`，编辑器不认识。
2. **剪贴板里同时有 `text/html` 和 `text/plain`**。Zotero 内置的 Markdown 粘贴只在「剪贴板仅有一种
   `text/plain`」时触发，否则改走 HTML 分支——而网页里的 HTML 是 KaTeX 渲染后的结构，粘进去就是
   一堆实体编码和乱码。
3. **即便换成 `$...$` 也可能不转**。Zotero 解析公式时带一个「像不像数学」的启发式（源码里的 `Rx`），
   要求内容含 `\命令`、或含 `+ - * / = ^ _`、或含配对花括号；`$m$` 这种单符号公式会被直接跳过。

本插件的做法是：**绕开这三条路，自己解析、自己插入**。

---

## 安装

1. 打开 Zotero → 菜单 **工具 → 插件**
2. 右上角齿轮 **⚙ → Install Plugin From File…**
3. 选择 `Zotero-Markdown-Paste-<版本>.xpi`（从仓库的 Releases 页面下载）
4. **重启 Zotero**

> 插件未签名。Zotero 不强制要求签名，可以正常安装。

---

## 使用

### 自动：复制 → 粘贴

在 DeepSeek 里选中回答 → `Ctrl+C` → Zotero 笔记里 `Ctrl+V`。

插件会判断这次内容要不要接管：

| 剪贴板内容 | 行为 |
| --- | --- |
| 含 `\(` 或 `\[` | 接管：按 Markdown 渲染 + 公式转成 Zotero 公式节点 |
| 不含 LaTeX，但含未渲染的 `**加粗**` 或 ` ``` ` 代码块 | 接管：按 Markdown 渲染 |
| 其他（PDF 纯文本、网页富文本、图片） | 不接管，走 Zotero 原生粘贴 |

按住 **Alt** 再粘贴 = 强制按 Markdown 解析。

### 手动：右键菜单

在笔记正文里**右键**，菜单中有：

> **从剪贴板进行格式转换并粘贴**

读取当前剪贴板文本 → 转换 → 插入光标位置。用途：自动粘贴没触发时兜底，也用来快速确认插件是否生效
（能看到这一项，就说明插件已加载并挂到了编辑器上）。

> 实现细节：这一项挂在**每个编辑器实例自己的 `#editor-menu`** 上，而不是窗口级的
> `#textbox-contextmenu`——实际弹出的是前者。每次 `popupshowing` 时动态补进去，不影响其他输入框。

---

## 支持的语法

- 标题 `#` ~ `######`、加粗 `**x**`、斜体 `*x*`、删除线 `~~x~~`、行内代码 `` `x` ``
- 有序 / 无序 / 嵌套列表、引用 `>`、分隔线、代码块
- 表格（含表头）
- 链接；图片会降级成链接（避免远程图片存成坏链）
- 公式：`\(...\)`、`$...$`（行内）；`\[...\]`、`$$...$$`（块级），含 `aligned` / `cases` /
  `matrix` 等环境的多行公式

**已知限制**

- 标题里的公式会降级成字面量 `$x$`。Zotero 的 schema 里标题内容不允许公式节点，硬塞会被丢弃，
  这里选择「宁可显示源码，也不丢内容」。
- 不在编辑区内的粘贴（如表格属性框）不会接管。

---

## 与 Better Notes 共存

Better Notes 的「增强的 Markdown 粘贴」与本插件职责重叠，建议**关掉其中一个**。
本插件会检测 `event.defaultPrevented`：识别到别的插件已接管就退出，不会重复插入。
右键菜单项与 Better Notes 的「复制笔记链接」可以同时存在，互不干扰（已在两者共存的真实环境中验证）。

---

## 工作原理

```
paste 事件（iframe 的 window，capture 阶段）
      │  只读 text/plain（读不到则退回系统剪贴板）
      ▼
markdown-it（commonmark + table + strikethrough）＋ 自定义公式规则
      │  公式 → <span class="math">$…$</span> / <pre class="math">$$…$$</pre>
      ▼
ProseMirror view.pasteHTML(html, 空剪贴板事件)
      │
      ▼
Zotero 笔记（math_inline / math_display 节点，KaTeX 渲染）
```

几个关键点（都来自对 Zotero 10.0.8 内置代码的阅读与实测）：

- 笔记编辑器是独立 iframe（`resource://zotero/note-editor/editor.html`），
  ProseMirror 视图位于 `window._currentEditorInstance._editorCore.view`。
- 公式在笔记 HTML 里的存储形式就是 `span.math` / `pre.math`，所以直接产出这种结构最稳，
  也就绕过了第 3 条启发式。
- `pasteHTML()` 内部会回调各插件的 `handlePaste`，因此必须传一个**空的 `ClipboardEvent`**，
  且该事件要在 iframe 自己的 compartment 里构造——从 chrome 作用域传普通对象进去，
  编辑器读到的是 Xray 包装，`clipboardData` 为 `undefined`。

---

## 目录结构

```
addon/                       插件本体（= .xpi 的内容）
  manifest.json              清单：ID、版本、兼容范围、更新地址
  bootstrap.js               生命周期、脚本装载
  prefs.js                   默认首选项
  content/
    converter.js             Markdown → Zotero 笔记 HTML（含公式规则）
    paste.js                 paste 拦截、右键菜单、插入
    markdown-it.min.js       内置依赖（MIT，见 THIRD_PARTY_NOTICES.md）
build.py                     打包成 .xpi（版本号读 manifest）
scripts/test-converter.js    转换层离线用例（21 条断言，无需 Zotero）
examples/
  deepseek-sample.md         粘贴测试样例
update.json                  Zotero 自动更新清单
.github/workflows/release.yml 打 tag 自动构建并发布 Release
```

---

## 开发

```bash
# 打包（产物在 dist/）
python build.py

# 只测转换层：不需要 Zotero，模拟 loadSubScript 的同一 global 环境
node scripts/test-converter.js
```

改了 `converter.js` / `paste.js` 之后，重新打包、覆盖安装、重启 Zotero 即可调试。
调试日志：**帮助 → 调试输出日志记录**，日志里搜 `MarkdownPaste`。

首选项（Zotero 设置 → 高级 → 配置编辑器）：

| 首选项 | 默认 | 说明 |
| --- | --- | --- |
| `extensions.mdpaste.enabled` | `true` | 关掉后插件完全不介入 |
| `extensions.mdpaste.debug` | `false` | 打开后 `Zotero.debug` 输出详细流程 |

---

## 发布与自动更新

> 仓库地址已按 `ZHENHUIFU/zotero-markdown-paste` 填好，涉及 2 个文件：
> `addon/manifest.json`（`homepage_url`、`update_url`）与 `update.json`。
> 如果你 fork 后要自己发布，把这两处的 `ZHENHUIFU/zotero-markdown-paste` 换成自己的路径即可。

### 发一个版本

1. 改 `addon/manifest.json` 的 `version`（例如 `1.2.3`），并在 `CHANGELOG.md` 记一笔
2. 提交：`git commit -am "release 1.2.3"`
3. 打 tag 并推送：

   ```bash
   git tag v1.2.3
   git push origin main --tags
   ```

4. GitHub Actions 会自动跑 `build.py`，把 `dist/Zotero-Markdown-Paste-1.2.3.xpi`
   作为附件挂到该 tag 的 Release 上
5. 更新 `update.json`：把 `version` 与 `update_link` 改成新版本，提交到 `main`

### 自动更新怎么生效

Zotero 定期读取 `manifest.json` 里的 `update_url`（本仓库指向
`https://raw.githubusercontent.com/ZHENHUIFU/zotero-markdown-paste/main/update.json`），比对 `update.json` 中的
`version`，发现更高版本就去 `update_link` 下载。字段格式参照在实际使用中的 Zotero 插件：

```json
{
  "addons": {
    "markdown-paste@workbuddy.local": {
      "updates": [
        {
          "version": "1.2.3",
          "update_link": "https://github.com/ZHENHUIFU/zotero-markdown-paste/releases/download/v1.2.3/Zotero-Markdown-Paste-1.2.3.xpi",
          "applications": {
            "zotero": { "strict_min_version": "7.0", "strict_max_version": "10.99.99" }
          }
        }
      ]
    }
  }
}
```

`update_hash` 可选（`sha512:<摘要>`），不填也能正常更新。

### 版本号约定

`主版本.次版本.修订号`：用户可见的行为变化 → 次版本；纯修复 → 修订号。
`addon/manifest.json` 是唯一版本号来源，`build.py` 与产物文件名都从它读取。

---

## 排错

按顺序排查：

1. **工具 → 插件** 里是否显示本插件、版本号对不对、是否启用
2. 装完/升级后**是否重启过 Zotero**（不重启不会加载新代码）
3. 打开 **帮助 → 调试输出日志记录**，再粘贴一次，日志里搜 `MarkdownPaste`：
   - `pasted via pasteHTML` → 正常
   - 无输出 → 这次内容没被判定为 Markdown，改用 `Alt+粘贴` 或右键菜单
   - `pasted via insertHTML` / `execCommand fallback` → 主路径失效但功能仍可用，请提 issue
4. 若与 Better Notes 同时开启增强粘贴，先关掉其中一个

---

## 许可证

代码以 [MIT](LICENSE) 发布。内置的 markdown-it 为 MIT，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
