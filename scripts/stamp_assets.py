#!/usr/bin/env python3
"""Stamp assets/style.css and assets/app.js with a content hash in index.html.

GitHub Pages serves every file with max-age=600, so a browser keeps showing the
previous stylesheet for up to ten minutes after a deploy. The query string makes
each change a new URL, so the update lands on the first reload.

Run before committing any change to the stylesheet or the script:
    python3 scripts/stamp_assets.py
"""

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
ASSETS = {"assets/style.css": r'href="assets/style\.css(?:\?v=[0-9a-f]+)?"',
          "assets/app.js": r'src="assets/app\.js(?:\?v=[0-9a-f]+)?"'}


def main():
    page = PAGE.read_text(encoding="utf-8")
    stamped = page
    for asset, pattern in ASSETS.items():
        digest = hashlib.sha1((ROOT / asset).read_bytes()).hexdigest()[:8]
        attr = "href" if asset.endswith(".css") else "src"
        stamped = re.sub(pattern, f'{attr}="{asset}?v={digest}"', stamped)
        print(f"{asset} -> {digest}")
    if stamped == page:
        print("index.html already current")
        return 0
    PAGE.write_text(stamped, encoding="utf-8")
    print("index.html updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
