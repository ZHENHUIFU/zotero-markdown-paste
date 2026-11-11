"""把 addon/ 打包成可安装的 .xpi（zip，manifest.json 位于压缩包根目录）。

用法：
    python build.py

产物：dist/Zotero-Markdown-Paste-<版本号>.xpi
版本号直接读 addon/manifest.json，避免两处手改不一致。
"""

import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "addon")
OUT_DIR = os.path.join(ROOT, "dist")

PLACEHOLDERS = ("OWNER/REPO", "example.com")


def read_manifest():
    with open(os.path.join(SRC, "manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def main():
    manifest = read_manifest()
    zotero_meta = manifest["applications"]["zotero"]
    version = manifest["version"]
    addon_id = zotero_meta["id"]
    update_url = zotero_meta.get("update_url", "")

    if any(p in update_url for p in PLACEHOLDERS):
        print("提示: manifest.json 的 update_url 仍是占位地址，正式发布前请改成自己的 update.json 链接。")

    out = os.path.join(OUT_DIR, "Zotero-Markdown-Paste-%s.xpi" % version)
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(out):
        os.remove(out)

    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(SRC):
            dirnames.sort()
            for name in sorted(filenames):
                if name.endswith(".pyc") or name.startswith("."):
                    continue
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, SRC).replace(os.sep, "/")
                zf.write(full, rel)
                count += 1

    print("打包完成: %s" % out)
    print("插件 ID: %s   版本: %s   文件数: %d" % (addon_id, version, count))
    print("大小: %d bytes" % os.path.getsize(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
