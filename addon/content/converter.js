/*
 * Markdown -> Zotero note HTML converter
 *
 * 关键点：Zotero 笔记编辑器的 ProseMirror schema 中
 *   行内公式节点 math_inline  : toDOM/parseDOM 都是  <span class="math">$tex$</span>
 *   块级公式节点 math_display : toDOM/parseDOM 都是  <pre class="math">$$tex$$</pre>
 * 因此只要把公式直接渲染成这两个结构，就不依赖 Zotero 内置的 $ 启发式判断，
 * 也不会走 text/html 剪贴板那条会产生 &#x...; 乱码的路径。
 *
 * markdown-it 的配置刻意与 Zotero 内置解析器保持一致：
 *   preset "commonmark" + { html:false, linkify:true, breaks:false } + enable([table, strikethrough])
 * 这样产出的 HTML 能被编辑器 schema 原样吃下（标题/列表/表格/引用/代码块/加粗斜体删除线）。
 */

var MDConverter = (function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1. 取到 markdown-it 构造器（UMD 三种出口都兼容）
  // ---------------------------------------------------------------------------
  var MarkdownIt = null;
  try {
    if (typeof markdownit !== "undefined" && typeof markdownit === "function") {
      MarkdownIt = markdownit;
    }
  } catch (e) { /* ignore */ }
  if (!MarkdownIt) {
    try {
      if (typeof module !== "undefined" && module && typeof module.exports === "function") {
        MarkdownIt = module.exports;
      }
    } catch (e) { /* ignore */ }
  }
  if (!MarkdownIt) {
    try {
      if (typeof globalThis !== "undefined" && typeof globalThis.markdownit === "function") {
        MarkdownIt = globalThis.markdownit;
      }
    } catch (e) { /* ignore */ }
  }

  var HAS_MD = typeof MarkdownIt === "function";

  // ---------------------------------------------------------------------------
  // 2. 工具函数
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var CODE_DOLLAR = 0x24;  // $
  var CODE_BACKSLASH = 0x5c; // \
  var CODE_LPAREN = 0x28;  // (
  var CODE_RPAREN = 0x29;  // )
  var CODE_LBRACKET = 0x5b; // [
  var CODE_RBRACKET = 0x5d; // ]
  var CODE_NL = 0x0a;

  // 纯数字（如 $100）不当公式
  var RE_PURE_NUMBER = /^[\d.,\s]+$/;

  function pushMathToken(state, tex, display) {
    var token = state.push(display ? "math_inline_display" : "math_inline", "span", 0);
    token.block = false;
    token.content = tex;
    token.attrs = [["class", "math"]];
    return token;
  }

  // ---------------------------------------------------------------------------
  // 3. 行内公式规则：$...$  /  \(...\)  /  \[...\] （出现在行中时按行内处理）
  // ---------------------------------------------------------------------------
  function mathInlineRule(state, silent) {
    var src = state.src;
    var pos = state.pos;
    var max = state.posMax;
    var c = src.charCodeAt(pos);

    // --- $...$ 与 $$...$$（出现在行中时） ---
    if (c === CODE_DOLLAR) {
      var isDouble = src.charCodeAt(pos + 1) === CODE_DOLLAR;
      var openLen = isDouble ? 2 : 1;
      var i = pos + openLen;
      var closeAt = -1;

      while (i < max) {
        var ch = src.charCodeAt(i);
        if (ch === CODE_NL) return false;              // 行内公式不跨行
        if (ch === CODE_BACKSLASH) { i += 2; continue; } // 跳过 \$ 之类
        if (ch === CODE_DOLLAR) {
          if (isDouble) {
            if (src.charCodeAt(i + 1) === CODE_DOLLAR) { closeAt = i; break; }
            i++;
            continue;
          }
          closeAt = i;
          break;
        }
        i++;
      }
      if (closeAt < 0) return false;

      var texDollar = src.slice(pos + openLen, closeAt);
      if (!texDollar || !texDollar.trim()) return false;
      if (/^\s/.test(texDollar) || /\s$/.test(texDollar)) return false;
      if (!isDouble && RE_PURE_NUMBER.test(texDollar)) return false;

      if (!silent) pushMathToken(state, texDollar.trim(), false);
      state.pos = closeAt + openLen;
      return true;
    }

    // --- \(...\) 与 \[...\] ---
    if (c === CODE_BACKSLASH) {
      var n1 = src.charCodeAt(pos + 1);
      var n2 = src.charCodeAt(pos + 2);

      // 兼容 DeepSeek 偶尔给出的双重反斜杠 \\( ... \\)
      var skip = 1;
      if (n1 === CODE_BACKSLASH && (n2 === CODE_LPAREN || n2 === CODE_LBRACKET)) {
        n1 = n2;
        skip = 2;
      }

      var isParen = n1 === CODE_LPAREN;
      var isBracket = n1 === CODE_LBRACKET;
      if (!isParen && !isBracket) return false;

      var closeCh = isParen ? CODE_RPAREN : CODE_RBRACKET;
      var begin = pos + skip + 1;
      var j = begin;
      var end = -1;
      while (j < max) {
        var cj = src.charCodeAt(j);
        if (cj === CODE_NL) return false;
        if (cj === CODE_BACKSLASH && src.charCodeAt(j + 1) === closeCh) { end = j; break; }
        j++;
      }
      if (end < 0) return false;

      var tex = src.slice(begin, end);
      if (!tex || !tex.trim()) return false;

      if (!silent) pushMathToken(state, tex.trim(), false);
      state.pos = end + 2;
      return true;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // 4. 块级公式规则：$$ ... $$ / \[ ... \]（独占整行时）
  // ---------------------------------------------------------------------------
  function mathBlockRule(state, startLine, endLine, silent) {
    var src = state.src;
    var pos = state.bMarks[startLine] + state.tShift[startLine];
    var lineMax = state.eMarks[startLine];
    if (pos >= lineMax) return false;

    var open, close;
    if (src.charCodeAt(pos) === CODE_DOLLAR && src.charCodeAt(pos + 1) === CODE_DOLLAR) {
      open = "$$";
      close = "$$";
    } else if (src.charCodeAt(pos) === CODE_BACKSLASH && src.charCodeAt(pos + 1) === CODE_LBRACKET) {
      open = "\\[";
      close = "\\]";
    } else {
      return false;
    }

    var from = pos + open.length;
    var closeAt = src.indexOf(close, from);
    if (closeAt < 0) return false;
    if (closeAt - from > 50000) return false; // 防止吞掉大段文本

    var endPos = closeAt + close.length;

    // 计算结束标记所在行
    var line = startLine;
    while (line + 1 < endLine && state.bMarks[line + 1] <= endPos) line++;
    if (line >= endLine) return false;

    // 结束标记之后，本行必须只剩空白，否则交给行内规则处理
    var rest = src.slice(endPos, state.eMarks[line]);
    if (/\S/.test(rest)) return false;

    var content = src.slice(from, closeAt);
    if (!content.trim()) return false;

    if (!silent) {
      var token = state.push("math_block", "pre", 0);
      token.block = true;
      token.content = content.trim();
      token.map = [startLine, line + 1];
      token.attrs = [["class", "math"]];
    }
    state.line = line + 1;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 5. 表格单元格内容包一层 <p>（与 Zotero 内置 markdown 解析器完全一致）
  //    schema 里 table_cell / table_header 的 content 是 block+，裸文本会被
  //    自动补段落，但显式补齐更稳妥。
  // ---------------------------------------------------------------------------
  function pmTableCellParagraphs(state) {
    var Token = state.Token;
    var tokens = state.tokens;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var isOpen = t && (t.type === "th_open" || t.type === "td_open");
      if (!isOpen) continue;
      var next = tokens[i + 1];
      if (!next || next.type !== "inline") continue;

      var pOpen = new Token("paragraph_open", "p", 1);
      pOpen.block = true;
      var pClose = new Token("paragraph_close", "p", -1);
      pClose.block = true;
      tokens.splice(i + 1, 0, pOpen);
      tokens.splice(i + 3, 0, pClose);
      i += 3;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. 构建解析器
  // ---------------------------------------------------------------------------
  var md = null;

  if (HAS_MD) {
    md = new MarkdownIt("commonmark", {
      html: false,
      linkify: true,
      breaks: false
    });
    md.enable(["table", "strikethrough"]);

    md.core.ruler.after("inline", "pm_table_cell_paragraphs", pmTableCellParagraphs);

    // 必须插在 escape 之前，否则 \( 会被 markdown-it 当成转义字符吃掉
    md.inline.ruler.before("escape", "math_delims", mathInlineRule);
    md.block.ruler.before("paragraph", "math_block_delims", mathBlockRule, {
      alt: ["paragraph", "reference", "blockquote"]
    });

    md.renderer.rules.math_inline = function (tokens, idx) {
      return '<span class="math">$' + escapeHtml(tokens[idx].content) + "$</span>";
    };
    md.renderer.rules.math_inline_display = function (tokens, idx) {
      return '<span class="math">$' + escapeHtml(tokens[idx].content) + "$</span>";
    };
    md.renderer.rules.math_block = function (tokens, idx) {
      return '<pre class="math">$$' + escapeHtml(tokens[idx].content) + "$$</pre>\n";
    };

    // 远程图片不落成本地附件，容易被存成坏链；降级成普通链接更安全
    md.renderer.rules.image = function (tokens, idx) {
      var token = tokens[idx];
      var src = token.attrGet("src") || "";
      var alt = token.content || src;
      return '<a href="' + escapeHtml(src) + '">' + escapeHtml(alt) + "</a>";
    };
  }

  // ---------------------------------------------------------------------------
  // 6.5 HTML 后处理
  //
  // schema 里 heading 的 content 是 "(text | hardBreak | citation | highlight |
  // underline_annotation)*"，**不含 math_inline**。若标题里塞 span.math，整段
  // 公式会被解析器直接丢弃。这里把标题内的公式降级成字面量 $...$，保证不丢内容。
  // ---------------------------------------------------------------------------
  function postProcess(html) {
    html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, function (whole, level, inner) {
      var fixed = inner.replace(
        /<span class="math">\$([\s\S]*?)\$<\/span>/g,
        "$$$1$$"
      );
      return "<h" + level + ">" + fixed + "</h" + level + ">";
    });

    // 若整段内容以 <pre>（块级公式 / 代码块）结尾，ProseMirror 解析出的 slice 末端是
    // "打开" 的，粘贴到已有段落中间时会把后面的文字吸进 pre 里。补一个空段落收口。
    if (/<\/pre>\s*$/.test(html)) {
      html += "<p></p>";
    }
    return html;
  }

  // ---------------------------------------------------------------------------
  // 7. 对外接口
  // ---------------------------------------------------------------------------
  function normalize(text) {
    return String(text == null ? "" : text)
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
  }

  /**
   * @param {string} text 剪贴板里的纯文本（markdown 源码）
   * @returns {{html:string, source:string, hasMath:boolean}}
   */
  function convert(text) {
    var src = normalize(text);
    if (!HAS_MD) {
      throw new Error("markdown-it 未加载成功");
    }
    var html = md.render(src);
    return {
      html: postProcess(html),
      source: src,
      hasMath: /\\[\(\[]/.test(src) || /\$[^$\n]+\$/.test(src)
    };
  }

  function isReady() {
    return HAS_MD;
  }

  return {
    convert: convert,
    isReady: isReady,
    escapeHtml: escapeHtml
  };
})();
