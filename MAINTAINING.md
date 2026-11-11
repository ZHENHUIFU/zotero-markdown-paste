# 维护手册

给未来的自己看的一份操作清单：怎么发版、Zotero 升级时查什么、出问题从哪儿下手。
面向使用者的说明在 [README](README.md)，这里只讲“维护动作”。

---

## 0. 一次性上传（只做一次）

前提：GitHub 上已建好空仓库（**Public**，创建时**不要**勾 README / .gitignore / license——本地都有）。

```bash
cd C:/Users/18429/WorkBuddy/zotero
git remote add origin https://github.com/ZHENHUIFU/zotero-markdown-paste.git
git push -u origin main
```

推送成功后发第一个版本：

```bash
git tag v1.2.3
git push origin main --tags
```

**检查点**（这一步最容易出错，且错了不报错）：

1. 仓库 **Actions** 里出现一次成功的 release 运行
2. **Releases** 里 `v1.2.3` 下挂着 `Zotero-Markdown-Paste-1.2.3.xpi`
3. 点开该附件，浏览器地址栏里的 URL 与 `update.json` 的 `update_link` **逐字符一致**
4. 在浏览器打开 `update_url`（`https://raw.githubusercontent.com/ZHENHUIFU/zotero-markdown-paste/main/update.json`），
   应返回 JSON 而不是 404

---

## 1. 每次发版的固定动作

| 步骤 | 命令 / 操作 | 备注 |
| --- | --- | --- |
| 1 | 改 `addon/manifest.json` 的 `version` | **唯一版本来源**，产物名跟着它变 |
| 2 | 在 `CHANGELOG.md` 顶部加一段 | 写“改了什么 + 为什么” |
| 3 | `python build.py` | 产物落在 `dist/` |
| 4 | `python scripts/check-release.py` | ID / 版本 / 链接 / 产物名一致性 |
| 5 | `node scripts/test-converter.js` | 改了 `converter.js` 时必跑 |
| 6 | `git commit -am "release x.y.z"` | |
| 7 | `git tag vX.Y.Z && git push origin main --tags` | tag 名必须与版本对应 |
| 8 | 等 Actions 跑完，确认 Release 附件 | |
| 9 | 改 `update.json` 的 `version` 与 `update_link`，提交推送到 main | **漏了这步 = 自动更新静默失效** |
| 10 | 用装了旧版的 Zotero 手动点一次“检查更新” | 端到端验证一次 |

第 9 步之后建议再跑一次 `check-release.py`。

---

## 2. 版本号怎么定

| 改动性质 | 动哪一位 | 例子 |
| --- | --- | --- |
| 修 bug、改文案 | 修订号 `x.y.Z` | 1.2.2 → 1.2.3 |
| 新增能力、行为变化 | 次版本 `x.Y.0` | 1.2.3 → 1.3.0 |
| 破坏性（改插件 ID、改存储格式、抬高低版本要求） | 主版本 `X.0.0` | 1.3.0 → 2.0.0 |

破坏性变更必须在 CHANGELOG 里用醒目标记写清“老用户需要做什么”。

---

## 3. 日常修 bug 的流程

1. **复现**：让对方提供 Zotero 版本、插件版本、一段能复现的 Markdown 原文
2. **看日志**：帮助 → 调试输出日志记录，筛 `MarkdownPaste`
   - `pasted via pasteHTML` → 插入层正常，问题多半在转换
   - `pasted via insertHTML` / `execCommand fallback` → 插入层降级了，通常是 Zotero 内部结构变了
   - 完全没有输出 → 拦截没触发（判定条件、插件未启用、或别的插件先接管）
3. **分层定位**：转换问题改 `converter.js`（可离线验证）；插入 / 菜单问题改 `paste.js`（只能真机验证）
4. **补测试**：转换层的 bug 一定要在 `scripts/test-converter.js` 里加一条断言，避免回归
5. **发版**：走第 1 节的流程

真机验证时用**临时 profile**，不要拿主力库试：

```bash
zotero.exe -profile <临时目录> -no-remote
```

---

## 4. Zotero 升级时的检查清单

Zotero 大版本更新后，按顺序过一遍：

- [ ] `addon/manifest.json` 的 `strict_max_version` 覆盖新版本（当前 `10.99.99`，通常够用）
- [ ] 编辑器视图入口是否仍为 `window._currentEditorInstance._editorCore.view`
- [ ] 编辑器菜单挂载点是否仍为实例上的 `_popup`（`#editor-menu`）
- [ ] 公式的存储形态是否仍是 `<span class="math">$…$</span>` / `<pre class="math">$$…$$</pre>`
- [ ] Zotero 自带的 Markdown 粘贴触发条件是否变化（它只在剪贴板仅含 `text/plain` 时触发）
- [ ] 内置 Markdown 解析器配置是否仍是 `commonmark` + `table` + `strikethrough`

插入路径有三级降级（`pasteHTML` → `insertHTML` → `execCommand`），前两级失效时功能仍可用，
日志里会标明走了哪条——**看到降级就该排进下个版本修**，别等到全坏。

---

## 5. 手动回归清单（约 5 分钟）

- [ ] 从 DeepSeek 复制一份带 `\(...\)` 和 `\[...\]` 的回答，直接粘贴：公式渲染、标题/列表/表格成形
- [ ] 单符号公式 `\(m\)` 能转（这条专门防 Zotero 内置启发式那类回归）
- [ ] 代码块里的 `\(x\)` 保持原样、未被转成公式
- [ ] 金额 `$100` 不被误判为公式
- [ ] 粘到**已有段落中间**，确认后文没有被吸进块级公式
- [ ] 右键菜单里有「从剪贴板进行格式转换并粘贴」，点击有效
- [ ] 与 Better Notes 同时开启时，没有出现两份内容

---

## 6. 别人提 issue 时要收集的信息

```
Zotero 版本：
插件版本（工具 → 插件里显示的那个）：
操作系统：
能否稳定复现：
复现用的 Markdown 片段（贴原文，不要截图）：
调试日志里 MarkdownPaste 相关的几行：
```

没有这几项基本无法定位——尤其“插件版本”，1.2.2 及以前挂在窗口级菜单上，1.2.3 才改到编辑器菜单。

---

## 7. 备份与几个坑

- **本地仓库是唯一副本**，至少推一份到 GitHub。`dist/` 不进版本库，产物随时可重建。
- **别把 Zotero 导出的笔记存回 `examples/`**。导出时会写入 YAML 头（`collections`、`$itemKey`、`$libraryID`），
  等于把个人库信息带进公开仓库；而且导出再导入的往返过程中，`\(` 的反斜杠可能被吃掉。
- **改插件 ID = 断更**。老版本收不到新版本的更新提示，必须让用户手动卸载重装。
- **忘记更新 `update.json` 不会报错**，只会让所有人静默停在旧版。发版后一定跑一次 `check-release.py`。
- **GitHub 推送失败（连接超时 / 502）**：常见于网络受限环境。优先用代理，或改用 SSH（`git@github.com:...`），
  或在 `~/.ssh/config` 里把 `github.com` 的 22 端口改走 443。

---

## 8. 想做再做（非必需）

- Issue 模板（`.github/ISSUE_TEMPLATE/bug_report.yml`），把第 6 节那几项做成表单
- 英文 README，方便非中文用户
- 插件图标（`icons/` + manifest 的 `icons` 字段），插件列表里更好认
- `update.json` 里补 `update_hash`（`sha512:<摘要>`），Zotero 会校验下载完整性
