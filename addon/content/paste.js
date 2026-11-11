/*
 * 粘贴拦截层
 *
 * 结构：Zotero 的笔记编辑器是一个独立的 iframe（resource://zotero/note-editor/editor.html），
 *      ProseMirror 实例挂在 iframe 里的 window._currentEditorInstance._editorCore.view 上。
 *
 * 策略：在 iframe 的 window 上以 capture 阶段监听 paste（比 editor 内部的监听更早），
 *      一旦判定这段文本需要处理，就 preventDefault + stopPropagation 完全接管，
 *      再用 Zotero 自己的 ProseMirror 视图把 HTML 插进去（等价于一次正常的富文本粘贴），
 *      从而避开 text/html 剪贴板那条会产生 &#x...; 乱码的路径。
 */

var MDPaste = (function () {
  "use strict";

  var Zotero = null;
  var PREF_ENABLED = "extensions.mdpaste.enabled";
  var PREF_DEBUG = "extensions.mdpaste.debug";

  var watched = []; // [{win, mo}]

  function debug(msg) {
    try {
      if (!Zotero) return;
      if (Zotero.Prefs && Zotero.Prefs.get(PREF_DEBUG, true) !== true) return;
      Zotero.debug("[MarkdownPaste] " + msg);
    } catch (e) { /* ignore */ }
  }

  function isEnabled() {
    try {
      return Zotero.Prefs.get(PREF_ENABLED, true) !== false;
    } catch (e) {
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // 窗口 / iframe 挂载
  // ---------------------------------------------------------------------------
  function isEditorFrame(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      var tag = String(el.tagName || "").toLowerCase();
      if (tag !== "iframe") return false;
      var id = el.getAttribute("id");
      if (id === "editor-view") return true;
      var src = el.getAttribute("src") || "";
      return src.indexOf("note-editor/editor.html") >= 0;
    } catch (e) {
      return false;
    }
  }

  function scanNode(node) {
    if (!node) return;
    try {
      if (node.nodeType === 9) { // Document
        scanNode(node.documentElement);
        return;
      }
      if (node.nodeType !== 1) return;
      if (isEditorFrame(node)) hookFrame(node);
      if (node.querySelectorAll) {
        var frames = node.querySelectorAll("iframe");
        for (var i = 0; i < frames.length; i++) {
          if (isEditorFrame(frames[i])) hookFrame(frames[i]);
        }
      }
    } catch (e) {
      debug("scanNode: " + e);
    }
  }

  function hookFrame(frame) {
    if (frame.__mdPasteFrame) return;
    try { frame.__mdPasteFrame = true; } catch (e) { return; }
    var onLoad = function () { hookFrameDoc(frame); };
    try { frame.addEventListener("load", onLoad); } catch (e) { /* ignore */ }
    hookFrameDoc(frame);
  }

  function hookFrameDoc(frame) {
    var cdoc = null, cwin = null;
    try {
      cwin = frame.contentWindow;
      cdoc = frame.contentDocument;
    } catch (e) {
      return;
    }
    if (!cdoc || !cwin || !cdoc.documentElement) return;
    if (cdoc.__mdPasteDoc) return;
    try { cdoc.__mdPasteDoc = true; } catch (e) { return; }

    try {
      cwin.addEventListener("paste", function (event) { onPaste(event, cwin); }, true);
      debug("attached to note editor iframe");
    } catch (e) {
      debug("addEventListener failed: " + e);
    }

    try {
      hookEditorMenu(frame, cwin);
    } catch (e) {
      debug("hookEditorMenu threw: " + e);
    }
  }

  function attachWindow(win) {
    if (!win) return;
    try {
      if (win.__mdPasteWin) return;
      win.__mdPasteWin = true;
      var doc = win.document;
      if (!doc || !doc.documentElement) return;

      var mo = new win.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var nodes = records[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) scanNode(nodes[j]);
        }
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      watched.push({ win: win, mo: mo });

      scanNode(doc.documentElement);
      debug("window attached: " + (win.location && win.location.href));
    } catch (e) {
      debug("attachWindow failed: " + e);
    }
  }

  function detachWindow(win) {
    for (var i = watched.length - 1; i >= 0; i--) {
      if (watched[i].win === win) {
        try { watched[i].mo.disconnect(); } catch (e) { /* ignore */ }
        watched.splice(i, 1);
      }
    }
    try { if (win) win.__mdPasteWin = false; } catch (e) { /* ignore */ }
  }

  function attachAllWindows() {
    var wins = [];
    try { wins = Zotero.getMainWindows() || []; } catch (e) { /* ignore */ }
    for (var i = 0; i < wins.length; i++) attachWindow(wins[i]);

    // 备用：枚举所有浏览器窗口（覆盖“在独立窗口中打开笔记”的情况）
    try {
      var e = Services.wm.getEnumerator("navigator:browser");
      while (e.hasMoreElements()) {
        var w = e.getNext();
        try {
          if (w.closed) continue;
          if (!w.document || !w.document.documentElement) continue;
          attachWindow(w);
        } catch (err) { /* ignore */ }
      }
    } catch (err) {
      debug("enumerate windows failed: " + err);
    }
  }

  // ---------------------------------------------------------------------------
  // 右键菜单项：从剪贴板进行格式转换并粘贴
  //
  // 实测结论（Zotero 10.0.8）：笔记正文里右键弹出的其实是**每个编辑器实例自己的**
  // #editor-menu（noteEditor.js 里的 <menupopup id="editor-menu"/>），不是窗口级的
  // #textbox-contextmenu。Better Notes 的「复制笔记链接」就是挂在 _popup 上，
  // 这里用同一条路子，避免挂错弹窗。
  // ---------------------------------------------------------------------------
  var ITEM_CLASS = "mdpaste-menu-item";
  var ITEM_LABEL = "从剪贴板进行格式转换并粘贴";

  function hookEditorMenu(frame, cwin) {
    var el = null;
    try { el = frame.closest ? frame.closest("note-editor") : null; } catch (e) { el = null; }

    var popup = null;
    try {
      var inst = el && el._editorInstance;
      popup = (inst && inst._popup) || (el && el.querySelector("#editor-menu")) || null;
    } catch (e) { popup = null; }

    if (!popup) { debug("editor-menu not found yet"); return; }
    if (popup.__mdPasteMenu) { popup.__mdPasteTarget = cwin; return; }

    try { popup.__mdPasteMenu = true; } catch (e) { return; }
    popup.__mdPasteTarget = cwin;

    popup.addEventListener("popupshowing", function (event) {
      if (event.target !== popup) return;
      try { ensureMenuItem(popup, popup.__mdPasteTarget || cwin); }
      catch (e) { debug("menu inject failed: " + e); }
    });
    debug("editor-menu hooked");
  }

  function ensureMenuItem(popup, cwin) {
    var existing = null;
    try { existing = popup.querySelector("." + ITEM_CLASS); } catch (e) { existing = null; }
    if (existing) { existing.__mdTarget = cwin; return; }

    var doc = popup.ownerDocument;
    var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    var item = null;
    try { item = doc.createXULElement("menuitem"); }
    catch (e) { item = doc.createElementNS(XUL_NS, "menuitem"); }

    item.setAttribute("class", ITEM_CLASS);
    item.setAttribute("label", ITEM_LABEL);
    item.__mdTarget = cwin;
    item.addEventListener("command", function () {
      var target = item.__mdTarget || cwin;
      var win = doc.defaultView;
      doConvertAndPaste(win, target);
    });

    popup.appendChild(item);
    debug("context menu item injected (" + popup.children.length + " items)");
  }

  function doConvertAndPaste(win, cwin) {
    if (!isEnabled()) {
      notify(win, "插件已被禁用（extensions.mdpaste.enabled = false）");
      return;
    }
    if (!cwin) {
      notify(win, "没找到笔记编辑器");
      return;
    }
    var text = readSystemClipboard("text/plain");
    if (!text || !text.trim()) {
      notify(win, "剪贴板里没有文本");
      return;
    }
    var editor = getEditor(cwin);
    if (!editor) {
      notify(win, "没找到编辑器实例");
      return;
    }
    var result;
    try {
      result = MDConverter.convert(text);
    } catch (e) {
      notify(win, "转换失败：" + e);
      return;
    }
    if (!result || !result.html) {
      notify(win, "转换结果为空");
      return;
    }
    var ok = insertHtml(editor, result.html, result.source);
    debug("menu convert+paste " + (ok ? "ok" : "failed") + ", " + result.source.length + " chars");
    if (!ok) notify(win, "插入失败，请打开调试输出日志查看原因");
  }

  function notify(win, msg) {
    debug("notify: " + msg);
    try {
      var pw = new Zotero.ProgressWindow({ window: win });
      pw.changeHeadline("Markdown 粘贴");
      pw.addDescription(msg);
      pw.show();
      pw.startCloseTimer(4000);
    } catch (e) {
      debug("notify failed: " + e);
    }
  }

  // ---------------------------------------------------------------------------
  // 取编辑器对象
  //
  // 实测（Zotero 10.0.8）：笔记编辑器 iframe 里 window._currentEditorInstance 是外层
  // 包装对象，_editorCore 是真正的编辑器，_editorCore.view 是 ProseMirror 视图。
  // ---------------------------------------------------------------------------
  function getEditor(cwin) {
    var w = cwin;
    try { w = cwin.wrappedJSObject || cwin; } catch (e) { w = cwin; }
    try {
      var inst = w._currentEditorInstance;
      var core = inst && inst._editorCore;
      var view = core && core.view;
      if (view && typeof view.pasteHTML === "function") {
        return { w: w, inst: inst, core: core, view: view };
      }
    } catch (e) {
      debug("getEditor failed: " + e);
    }
    return null;
  }

  // pasteHTML(html, event) 内部会回调各插件的 handlePaste，所以必须传一个"空剪贴板"的
  // 事件，否则 Zotero 自带的粘贴处理器会再去读原始剪贴板，导致内容重复。
  //
  // 关键坑：这个事件对象必须在 iframe 自己的 compartment 里构造。从 chrome 作用域传
  // 普通对象进去，编辑器内部读到的是 Xray 包装，clipboardData 直接是 undefined，
  // 会抛 "can't access property getData"。
  function buildPasteEvent(w) {
    var dt = new w.DataTransfer();
    return new w.ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
  }

  // 把 HTML 插进编辑器，三级降级
  function insertHtml(editor, html, fallbackText) {
    // 方案一：ProseMirror 标准粘贴路径（正确替换选区、进撤销栈）
    try {
      editor.view.pasteHTML(html, buildPasteEvent(editor.w));
      debug("pasted via pasteHTML");
      return true;
    } catch (e) {
      debug("pasteHTML failed: " + e);
    }

    // 方案二：编辑器内部的 insertHTML（Zotero 插入注释走的就是它）
    try {
      editor.core.insertHTML(null, html);
      debug("pasted via insertHTML");
      return true;
    } catch (e) {
      debug("insertHTML failed: " + e);
    }

    // 方案三：至少把纯文本插进去，别让用户什么都得不到
    try {
      editor.w.document.execCommand("insertText", false, fallbackText || "");
      debug("pasted via execCommand fallback");
      return true;
    } catch (e) {
      debug("execCommand fallback failed: " + e);
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 读剪贴板
  //
  // 优先读粘贴事件自带的 clipboardData；如果拿不到（跨 compartment 的 Xray 包装
  // 有时会失败），退回到系统剪贴板 —— 粘贴发生时两者内容是一致的。
  // ---------------------------------------------------------------------------
  function readSystemClipboard(flavor) {
    try {
      var trans = Components.classes["@mozilla.org/widget/transferable;1"]
        .createInstance(Components.interfaces.nsITransferable);
      trans.init(null);
      trans.addDataFlavor(flavor);
      Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
      var data = {};
      var length = {};
      trans.getTransferData(flavor, data, length);
      if (!data.value) return "";
      return String(
        data.value.QueryInterface(Components.interfaces.nsISupportsString).data || ""
      );
    } catch (e) {
      debug("system clipboard read failed (" + flavor + "): " + e);
      return "";
    }
  }

  function readClipboard(event) {
    var text = "";
    try {
      var dt = event.clipboardData;
      if (dt) {
        text = dt.getData("text/plain") || "";
      }
    } catch (e) {
      debug("event clipboard read failed: " + e);
    }
    if (!text) {
      text = readSystemClipboard("text/plain");
    }
    return text;
  }

  // ---------------------------------------------------------------------------
  // 主处理
  // ---------------------------------------------------------------------------
  function onPaste(event, cwin) {
    try {
      if (!isEnabled()) return false;
      // 别的插件（例如 Better Notes）已经接管了这次粘贴，就不要重复插入
      if (event.defaultPrevented) return false;

      var text = readClipboard(event);
      if (!text || !text.trim()) return false;

      var hasLatex = /\\[\(\[]/.test(text);
      if (!hasLatex && !event.altKey) {
        // 没有 LaTeX 定界符时，只接管"明显是 markdown 源码"的内容（未渲染的 ** 或 ```）。
        // 这样不会把网页上正常复制的富文本当成 markdown 重新排版。
        var looksSource = /\*\*[^\s*][\s\S]*?\*\*/.test(text) || text.indexOf("```") >= 0;
        if (!looksSource) return false;
      }

      var result;
      try {
        result = MDConverter.convert(text);
      } catch (e) {
        debug("convert failed: " + e);
        return false;
      }
      if (!result || !result.html) return false;

      var editor = getEditor(cwin);

      if (!editor) {
        // 拿不到编辑器对象时不接管，交给 Zotero 原生粘贴（至少不会丢内容）
        debug("no editor instance found, leave it to Zotero");
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();

      insertHtml(editor, result.html, result.source);
      debug("auto paste handled, " + result.source.length + " chars");
      return true;
    } catch (e) {
      debug("onPaste crashed: " + e);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------
  function init(zotero, rootURI) {
    Zotero = zotero;
    if (!MDConverter || !MDConverter.isReady()) {
      debug("markdown-it 未就绪，插件不会生效");
    }
  }

  function shutdown() {
    for (var i = 0; i < watched.length; i++) {
      try { watched[i].mo.disconnect(); } catch (e) { /* ignore */ }
    }
    watched = [];
  }

  return {
    init: init,
    shutdown: shutdown,
    attachWindow: attachWindow,
    detachWindow: detachWindow,
    attachAllWindows: attachAllWindows
  };
})();
