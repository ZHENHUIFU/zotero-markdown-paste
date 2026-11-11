"""发布前的一致性自检。

检查几处容易对不上、而且对不上就静默失效的地方：
  - manifest 的 id 与 update.json 的键是否一致（不一致 → 自动更新永远查不到）
  - update.json 的 version 与 manifest 的 version 是否一致
  - update_link 里的 xpi 文件名是否带上了该版本号
  - dist/ 里是否真的有对应版本的产物

用法：
    python scripts/check-release.py
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "addon", "manifest.json")
UPDATE = os.path.join(ROOT, "update.json")
DIST = os.path.join(ROOT, "dist")

errors = []
warnings = []


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


manifest = load(MANIFEST)
meta = manifest["applications"]["zotero"]
addon_id = meta["id"]
manifest_version = manifest["version"]

update = load(UPDATE)
keys = list(update.get("addons", {}).keys())

if len(keys) != 1:
    errors.append("update.json 的 addons 应只有 1 个键，实际 %d 个" % len(keys))
else:
    update_key = keys[0]
    if update_key != addon_id:
        errors.append("插件 ID 不一致：manifest=%s  update.json=%s" % (addon_id, update_key))

    updates = update["addons"][update_key].get("updates", [])
    if not updates:
        errors.append("update.json 里没有任何 updates 条目")
    else:
        latest = updates[0]
        if latest.get("version") != manifest_version:
            errors.append(
                "版本不一致：manifest=%s  update.json=%s"
                % (manifest_version, latest.get("version"))
            )
        link = latest.get("update_link", "")
        if manifest_version not in link:
            errors.append("update_link 未包含当前版本号 %s：%s" % (manifest_version, link))

xpi_name = "Zotero-Markdown-Paste-%s.xpi" % manifest_version
xpi_path = os.path.join(DIST, xpi_name)
if not os.path.exists(xpi_path):
    warnings.append("dist/ 下没有 %s，发布前记得先 python build.py" % xpi_name)

if "example.com" in meta.get("update_url", "") or "OWNER/REPO" in meta.get("update_url", ""):
    warnings.append("manifest 的 update_url 仍是占位地址：%s" % meta["update_url"])

print("插件 ID : %s" % addon_id)
print("版本    : %s" % manifest_version)
print("更新地址: %s" % meta.get("update_url", "(未设置)"))
print("产物    : %s" % (xpi_name if os.path.exists(xpi_path) else "(尚未构建)"))

for w in warnings:
    print("提示: " + w)

if errors:
    for e in errors:
        print("错误: " + e)
    sys.exit(1)

print("一致性检查通过")
