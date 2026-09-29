#!/usr/bin/env python3
"""Rebuild src/bank/lessons.json: which topic section illustrates which interview question.

`sections` is re-read from every topic's Page.tsx; `links` (question id -> anchors) is kept,
and any JSON files passed as arguments are merged in over it. Links to sections that no
longer exist are dropped with a warning.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/bank/lessons.json"


def sections():
    reg = (ROOT / "src/topics/registry.ts").read_text()
    out = {}
    for block in re.findall(r"\{\s*slug: '[^']+'[\s\S]*?\n  \}", reg):
        slug = re.search(r"slug: '([^']+)'", block).group(1)
        title = re.search(r"title: '([^']+)'", block).group(1)
        folder = re.search(r"import\('\./([^/]+)/Page'\)", block).group(1)
        src = (ROOT / f"src/topics/{folder}/Page.tsx").read_text()
        for sid, t in re.findall(r'<Section id="([^"]+)" n="\d+" kicker="[^"]*" title="([^"]*)"', src):
            if t != "Asked in real interviews":
                out[f"{slug}#{sid}"] = [title, t]
    return out


def main(extra):
    secs = sections()
    links = json.loads(OUT.read_text())["links"] if OUT.exists() else {}
    for f in extra:
        links.update(json.loads(Path(f).read_text()))
    clean = {}
    for qid, anchors in sorted(links.items()):
        keep = [a for a in anchors if a in secs]
        for a in set(anchors) - set(keep):
            print(f"drop {qid} -> {a}", file=sys.stderr)
        if keep:
            clean[qid] = keep[:2]
    OUT.write_text(json.dumps({"sections": secs, "links": clean}, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(secs)} sections, {len(clean)} linked questions")


if __name__ == "__main__":
    main(sys.argv[1:])
