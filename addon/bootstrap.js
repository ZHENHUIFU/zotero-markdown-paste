/*
 * Markdown Paste for Zotero —— 启动引导
 *
 * 目标：把从 DeepSeek / ChatGPT 等网页复制出来的 Markdown（公式用 \(...\)、\[...\]）
 *      粘贴进 Zotero 笔记时，自动转成 Zotero 能渲染的行内 / 块级公式，
 *      同时保留标题、列表、表格、加粗等 Markdown 结构。
 */

var MDPasteBundle = null;

function mdpLog(msg) {
  try {
    Zotero.debug("[MarkdownPaste] " + msg);
  } catch (e) { /* ignore */ }
}

function install(data, reason) {
  mdpLog("installed");
}

async function startup({ id, version, rootURI }, reason) {
  if (typeof Zotero === "undefined") {
    return;
  }
  await Zotero.initializationPromise;

  var ctx = {
    rootURI: rootURI,
    // markdown-it 的 UMD 包装会优先检测 module/exports，这样加载结果最可控
    module: { exports: {} },
    exports: {},
    // 沙箱里没有 Gecko 全局，显式传进去（读系统剪贴板要用）
    Services: Services,
    Components: Components
  };
  ctx._globalThis = ctx;

  try {
    Services.scriptloader.loadSubScript(rootURI + "content/markdown-it.min.js", ctx);
    Services.scriptloader.loadSubScript(rootURI + "content/converter.js", ctx);
    Services.scriptloader.loadSubScript(rootURI + "content/paste.js", ctx);
  } catch (e) {
    mdpLog("script load failed: " + e);
    throw e;
  }

  MDPasteBundle = ctx;
  ctx.MDPaste.init(Zotero, rootURI);
  ctx.MDPaste.attachAllWindows();

  mdpLog("started v" + version + ", converter ready = " + !!(ctx.MDConverter && ctx.MDConverter.isReady()));
}

function onMainWindowLoad({ window }) {
  try {
    if (MDPasteBundle && MDPasteBundle.MDPaste) {
      MDPasteBundle.MDPaste.attachWindow(window);
    }
  } catch (e) {
    mdpLog("onMainWindowLoad failed: " + e);
  }
}

function onMainWindowUnload({ window }) {
  try {
    if (MDPasteBundle && MDPasteBundle.MDPaste) {
      MDPasteBundle.MDPaste.detachWindow(window);
    }
  } catch (e) {
    mdpLog("onMainWindowUnload failed: " + e);
  }
}

function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  try {
    if (MDPasteBundle && MDPasteBundle.MDPaste) {
      MDPasteBundle.MDPaste.shutdown();
    }
  } catch (e) {
    mdpLog("shutdown failed: " + e);
  }
  MDPasteBundle = null;
  mdpLog("shutdown");
}

function uninstall(data, reason) {
  mdpLog("uninstalled");
}
