"""Builds the Chrome Web Store package of the extension into dist/.

The store build talks only to the hosted service: the default server is Snapply cloud, the
"This computer" server option is removed, local host permissions are dropped, and the development
"key" (which pins the unpacked extension id) is removed because the store assigns its own id.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "extension"
DIST = ROOT / "dist"


def build() -> Path:
    out = DIST / "store"
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns(".DS_Store", "*.map"))

    manifest = json.loads((out / "manifest.json").read_text())
    manifest.pop("key", None)
    manifest["permissions"] = [p for p in manifest["permissions"] if p != "scripting"]
    manifest["host_permissions"] = [h for h in manifest["host_permissions"] if "127.0.0.1" not in h and "localhost" not in h]
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    api = (out / "api_client.js").read_text()
    api, n = re.subn(r"return x\.apiBase\|\|(?:LOCAL|CLOUD)\}", "return x.apiBase&&x.apiBase!==LOCAL?x.apiBase:CLOUD}", api)
    assert n == 1, "api_client.js default server not found"
    (out / "api_client.js").write_text(api)

    popup = (out / "popup.html").read_text()
    popup, n = re.subn(r"<h3>Server</h3>.*?</select>", "", popup, flags=re.S)
    assert n == 1, "server choice not found in popup.html"
    (out / "popup.html").write_text(popup)

    zip_path = DIST / f"snapply-{manifest['version']}-store.zip"
    zip_path.unlink(missing_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(out))
    return zip_path


if __name__ == "__main__":
    path = build()
    print(f"{path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
    sys.exit(0)
