#!/usr/bin/env python3
"""Rebuild the GitHub activity block in index.html.

Reads the public contributions calendar of USER, renders it as an inline SVG
grid and injects the result between the markers in index.html. Standard
library only, no tokens needed: the endpoint is public.

Usage: python3 scripts/build_contributions.py [--check]
"""

import argparse
import html
import pathlib
import re
import sys
import urllib.request
from datetime import date

USER = "iani-kuli"
SOURCE = f"https://github.com/users/{USER}/contributions"
ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
START = "<!-- contrib:start -->"
END = "<!-- contrib:end -->"

CELL = 11
GAP = 3
STEP = CELL + GAP
PAD_LEFT = 26
PAD_TOP = 17
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fetch(url):
    req = urllib.request.Request(url, headers={
        "x-requested-with": "XMLHttpRequest",
        "user-agent": f"{USER}.github.io contribution graph builder",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse(page):
    """Return (total, days) where days maps (row, col) to (date, level, count)."""
    head = re.search(r"<h2[^>]*>\s*([\d,]+)\s*\n?\s*contributions", page)
    total = int(head.group(1).replace(",", "")) if head else 0

    counts = {}
    for cell_id, text in re.findall(
        r'<tool-tip[^>]*for="(contribution-day-component-[\d-]+)"[^>]*>(.*?)</tool-tip>',
        page, re.S,
    ):
        n = re.match(r"\s*([\d,]+)\s+contribution", html.unescape(text))
        counts[cell_id] = int(n.group(1).replace(",", "")) if n else 0

    days = {}
    for tag in re.findall(r"<td[^>]*class=\"ContributionCalendar-day\"[^>]*>", page):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        cell_id = attrs.get("id", "")
        pos = re.search(r"component-(\d+)-(\d+)$", cell_id)
        if not pos or "data-date" not in attrs:
            continue
        row, col = int(pos.group(1)), int(pos.group(2))
        days[(row, col)] = (
            attrs["data-date"],
            int(attrs.get("data-level", 0)),
            counts.get(cell_id, 0),
        )
    if not days:
        raise SystemExit("no contribution cells parsed, the source markup changed")
    return total, days


def month_labels(days, cols):
    """One label per month, anchored at the first column that month owns."""
    out, seen = [], set()
    for col in range(cols):
        column = [days[(r, col)][0] for r in range(7) if (r, col) in days]
        if not column:
            continue
        first = date.fromisoformat(min(column))
        key = (first.year, first.month)
        if key in seen or first.day > 14:
            continue
        seen.add(key)
        out.append((col, MONTHS[first.month - 1]))
    return out


def render(total, days):
    cols = max(col for _, col in days) + 1
    width = PAD_LEFT + cols * STEP - GAP
    height = PAD_TOP + 7 * STEP - GAP
    dates = sorted(day[0] for day in days.values())
    span = f"{dates[0]} to {dates[-1]}"

    svg = [
        f'<svg class="contrib__grid" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" '
        f'aria-label="{total} GitHub contributions from {dates[0]} to {dates[-1]}">'
    ]
    for col, name in month_labels(days, cols):
        svg.append(
            f'<text class="contrib__mon" x="{PAD_LEFT + col * STEP}" y="10">{name}</text>'
        )
    for row, name in ((1, "Mon"), (3, "Wed"), (5, "Fri")):
        y = PAD_TOP + row * STEP + CELL - 2
        svg.append(f'<text class="contrib__dow" x="0" y="{y}">{name}</text>')
    for (row, col), (day, level, count) in sorted(days.items()):
        x = PAD_LEFT + col * STEP
        y = PAD_TOP + row * STEP
        svg.append(
            f'<rect class="c{level}" x="{x}" y="{y}" width="{CELL}" height="{CELL}" '
            f'rx="2"><title>{day}: {count}</title></rect>'
        )
    svg.append("</svg>")

    legend = "".join(
        f'<svg class="contrib__key" viewBox="0 0 {CELL} {CELL}" width="{CELL}" '
        f'height="{CELL}" aria-hidden="true"><rect class="c{lvl}" width="{CELL}" '
        f'height="{CELL}" rx="2"/></svg>'
        for lvl in range(5)
    )

    return f"""{START}
  <section id="activity" class="section reveal">
    <h2 class="section__title">Activity</h2>
    <p class="section__note">
      <b class="contrib__total">{total}</b> contributions on GitHub, {span}.
      Public repositories only, private work is not counted.
      <a class="ilink" href="https://github.com/{USER}" rel="noopener">github.com/{USER}</a>
    </p>
    <div class="contrib">
      <div class="contrib__scroll">
        {"".join(svg)}
      </div>
      <p class="contrib__legend"><span>Less</span>{legend}<span>More</span></p>
    </div>
  </section>
  {END}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit 1 when index.html is out of date instead of writing it")
    args = ap.parse_args()

    total, days = parse(fetch(SOURCE))
    block = render(total, days)

    page = PAGE.read_text(encoding="utf-8")
    if START not in page or END not in page:
        raise SystemExit(f"markers {START} / {END} not found in {PAGE.name}")
    updated = re.sub(
        re.escape(START) + r".*?" + re.escape(END), lambda _: block, page, flags=re.S
    )
    if updated == page:
        print(f"up to date, {total} contributions")
        return 0
    if args.check:
        print(f"index.html is stale, {total} contributions")
        return 1
    PAGE.write_text(updated, encoding="utf-8")
    print(f"index.html updated, {total} contributions over {len(days)} days")
    return 0


if __name__ == "__main__":
    sys.exit(main())
