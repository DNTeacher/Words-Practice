"""Bricks Reading Word List (PDF) → 단어장 정리본 JSON (books/<id>.json)

PDF 모양 (Bricks Reading 250 Level 2 Word List, 2026-11-09):
- 쪽마다 맨 위에 "Unit 1. 제목" 또는 "Unit 10- 제목" (14pt 굵게), 2단, 쪽마다 단어 10개 (한 Unit = 2쪽 = 20개)
- 단어 줄: "• neat 멋진, 훌륭한" — 글머리표와 단어는 굵은 색 글씨, 뜻은 보통 글씨
- 그 아래 영어 풀이(회색 기울임)·예문·예문 번역은 뺀다
- 순서: 쪽마다 왼쪽 단을 위에서 아래로, 그다음 오른쪽 단 (Word 2단 흐름)

쓰기: python3 bricks_reading_pdf.py 원본.pdf 단어장id "단어장 이름" [반코드] > books/<id>.json
"""
import json, re, sys
from datetime import date

import pdfplumber

# 원본 오타 (단어 철자) — 고친 것은 fixes 에 남긴다
TYPO = {"for exmaple": "for example"}


def line_text(chars):
    chars = sorted(chars, key=lambda c: c["x0"])
    out, prev = "", None
    for c in chars:
        if prev is not None and c["x0"] - prev["x1"] > c["size"] * 0.2:
            out += " "
        out += c["text"]
        prev = c
    return re.sub(r"\s+", " ", out).strip()


def parse(src):
    units, cur = [], None
    with pdfplumber.open(src) as pdf:
        for p in pdf.pages:
            mid = p.width / 2
            rows = {}
            for c in p.chars:
                if not c["text"].strip():
                    continue
                rows.setdefault((0 if c["x0"] < mid - 5 else 1, round(c["top"])), []).append(c)
            merged = []
            for key in sorted(rows):  # (단, 위치) 순서 = 왼쪽 단 위→아래, 오른쪽 단 위→아래
                if merged and merged[-1][0][0] == key[0] and abs(merged[-1][0][1] - key[1]) <= 2:
                    merged[-1][1].extend(rows[key])
                else:
                    merged.append([key, rows[key]])
            for _, cs in merged:
                txt = line_text(cs)
                m = re.match(r"Unit (\d+)\s*[.\-]\s*(.+)", txt)
                if m and cs[0]["size"] >= 13:
                    n = int(m.group(1))
                    if not cur or cur["n"] != n:
                        cur = {"n": n, "name": f"Unit {n}. {m.group(2).strip()}", "items": []}
                        units.append(cur)
                    continue
                if txt.startswith("•"):
                    w = line_text([c for c in cs if "Bold" in c["fontname"] and c["text"] != "•"])
                    mean = line_text([c for c in cs if "Bold" not in c["fontname"]])
                    cur["items"].append((w, mean))
    return units


def main():
    src, bid, name = sys.argv[1:4]
    classes = sys.argv[4:]
    fixes, sections = [], []
    for u in parse(src):
        items = []
        for i, (w, m) in enumerate(u["items"], 1):
            if w in TYPO:
                fixes.append(f"Unit {u['n']} {i}번 단어 {w} → {TYPO[w]}")
                w = TYPO[w]
            m = m.replace("’", "'").rstrip(". ").strip()
            items.append({"no": i, "w": w.replace("’", "'"), "m": m})
        sections.append({"name": u["name"].replace("’", "'"), "items": items})
    book = {"id": bid, "book": name, "source": f"{name} Word List (.pdf, 쪽마다 2단, Unit 마다 2쪽)",
            "made": date.today().isoformat(), "classes": classes, "fixes": fixes,
            "notes": ["영어 풀이·예문·예문 번역은 뺌", "순서: 쪽마다 왼쪽 단 위→아래, 그다음 오른쪽 단", "뜻 끝의 마침표는 뺌"],
            "sections": sections}
    out = json.dumps({k: v for k, v in book.items() if k != "sections"}, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"sections":[\n'
    out += ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in sections) + "\n]}\n"
    sys.stdout.write(out)


if __name__ == "__main__":
    main()
