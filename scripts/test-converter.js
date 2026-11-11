/* 离线用例：模拟 loadSubScript 后对转换结果做断言 */
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const contentDir = path.join(__dirname, "..", "addon", "content");
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(contentDir, "markdown-it.min.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(contentDir, "converter.js"), "utf8"), sandbox);
const C = sandbox.MDConverter;

let pass = 0, fail = 0;
function check(name, src, must, mustNot) {
  const html = C.convert(src).html;
  const problems = [];
  (must || []).forEach((s) => { if (!html.includes(s)) problems.push("缺少: " + s); });
  (mustNot || []).forEach((s) => { if (html.includes(s)) problems.push("不应出现: " + s); });
  if (problems.length) {
    fail++;
    console.log("✗ " + name + "\n    " + problems.join("\n    ") + "\n    HTML: " + html.replace(/\n/g, "⏎"));
  } else {
    pass++;
    console.log("✓ " + name);
  }
}

check("行内公式 \\(..\\)", "其中 \\(m\\) 为质量。",
  ['<span class="math">$m$</span>']);

check("行内公式 \\(..\\) 含命令", "当 \\(\\alpha + \\beta = 1\\) 时成立。",
  ['<span class="math">$\\alpha + \\beta = 1$</span>']);

check("块级公式 \\[..\\] 独占行", "推导如下\n\\[\nE = mc^2\n\\]\n完毕",
  ['<pre class="math">$$E = mc^2$$</pre>']);

check("块级公式 \\[..\\] 单行", "\\[ a^2 + b^2 = c^2 \\]",
  ['<pre class="math">$$a^2 + b^2 = c^2$$</pre>']);

check("块级公式 $$..$$", "$$\n\\int_0^1 f(x)\\,dx = 1\n$$",
  ['<pre class="math">$$\\int_0^1 f(x)\\,dx = 1$$</pre>']);

check("aligned 环境", "\\[\n\\begin{aligned}\na &= b + c \\\\\nd &= e\n\\end{aligned}\n\\]",
  ['<pre class="math">'], ['&amp;lt;']);

check("多行块公式", "\\[\n\\frac{\\partial u}{\\partial t}\n+ u\\nabla u\n= -\\nabla p\n\\]",
  ['<pre class="math">$$\\frac{\\partial u}{\\partial t}']);

check("标题内公式不丢内容（降级为 $..$）", "## 关于 \\(x\\) 的定义",
  ["<h2>"], ["<span class=\"math\">"]);

check("加粗 / 斜体 / 删除线", "**粗** 与 *斜* 与 ~~删~~",
  ["<strong>粗</strong>", "<em>斜</em>", "<s>删</s>"]);

check("无序与有序列表", "- a\n- b\n\n1. c\n2. d",
  ["<ul>", "<li>a</li>", "<ol>", "<li>c</li>"]);

check("嵌套列表", "- 父\n  - 子",
  ["<ul>", "<li>父", "<li>子"]);

check("表格", "| a | b |\n| --- | --- |\n| 1 | 2 |",
  ["<table>", "<th>", "<td>", "<p>1</p>"]);

check("代码块保持原样", "```python\nx = \\(a+b\\)\n```",
  ["<pre><code", "\\(a+b\\)"]);

check("行内代码保持原样", "`\\(a+b\\)`",
  ["<code>\\(a+b\\)</code>"], ['<span class="math">']);

check("美元金额不误判", "价格 $100 到 $200 之间", ["$100 到 $200"], ['<span class="math">']);

check("行内 $..$ 支持", "设 $x^2$ 为平方", ['<span class="math">$x^2$</span>']);

check("引用块", "> 引用 \\(E=mc^2\\)", ["<blockquote>", '<span class="math">$E=mc^2$</span>']);

check("图片降级为链接", "![图](https://example.com/a.png)",
  ['<a href="https://example.com/a.png">图</a>'], ["<img"]);

check("LaTeX 转义字符不被吃掉", "\\[ \\rho \\left( \\frac{\\partial u}{\\partial t} \\right) \\]",
  ["\\rho", "\\left("]);

check("公式内的 < > 被正确转义", "设 \\(a < b\\) 成立", ['<span class="math">$a &lt; b$</span>']);

check("普通文本段落", "这是一段普通文字。", ["<p>这是一段普通文字。</p>"]);

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
