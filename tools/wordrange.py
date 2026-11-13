"""정리된 단어장(JSON)에서 시험 범위 글자("4회 11~20번", "unit.5", "Day 7 1~10")로 단어·뜻 꺼내기 (앱에 넣기 전 시험용)."""
import json, re, sys

POS = r"(?:n|v|adj|adv|prep|pron|conj|int|interj|aux|det|num|phr)\."

def clean_meaning(m):
    """품사 표시는 빼고, 품사가 여러 개면 ' / ' 로 나눈다 (선생님이 unit.5 에서 쓴 방식). 품사 목록은 따로 돌려준다."""
    m = (m or "").replace("’", "'").replace("‘", "'")
    m = re.split(r"\s*\*", m)[0]  # "* breakfast 아침식사" 같은 덧붙임 설명은 뺀다
    m = re.sub(r"\s+", " ", m.strip())
    tags = re.findall(r"(?:^|(?<=[\s,]))(" + POS + r")", m)
    parts = [p.strip(" ,") for p in re.split(r"(?:^|(?<=[\s,]))" + POS + r"\s*", m)]
    parts = [p for p in parts if p]
    return " / ".join(parts), [t.rstrip(".") for t in tags]

def clean_word(w):
    w = (w or "").replace("’", "'").replace("‘", "'")
    w = re.sub(r"\s*/\s*", " / ", w)  # "straight /curly" → "straight / curly"
    return re.sub(r"\s+", " ", w.strip())

KIND = {"회": "회", "unit": "unit", "u": "unit", "lesson": "lesson", "l": "lesson", "day": "day", "chapter": "chapter", "ch": "chapter", "part": "part", "page": "쪽", "p": "쪽", "쪽": "쪽", "과": "lesson"}

def sec_key(name):
    n = name.lower().replace(".", " ")
    m = re.search(r"(\d+)\s*(회|과|쪽)", n) or None
    if m: return (KIND[m.group(2)], int(m.group(1)))
    m = re.search(r"(unit|lesson|day|chapter|ch|part|page|u|l|p)\s*(\d+)", n)
    if m: return (KIND[m.group(1)], int(m.group(2)))
    return None

def resolve(book, q):
    keys = {sec_key(s["name"]): s for s in book["sections"]}
    kinds = {k[0] for k in keys if k}
    q0 = q.lower().replace(".", " ").replace("–", "~").replace("-", "~")
    found = []
    # 1) 구역(회/unit/day…) + 그 바로 뒤의 번호 범위
    pat = re.compile(r"(?:(unit|lesson|day|chapter|ch|part|page|u|l|p)\s*(\d+)(?:\s*~\s*(\d+))?|(\d+)(?:\s*~\s*(\d+))?\s*(회|과|쪽))(?:\s*[,:]?\s*(\d+)\s*~\s*(\d+)\s*번?|\s*[,:]?\s*(\d+)\s*번|\s+(\d+)(?!\s*(?:회|과|쪽|~|\d)))?")
    for m in pat.finditer(q0):
        if m.group(1): kind, a, b = KIND[m.group(1)], int(m.group(2)), int(m.group(3) or m.group(2))
        else: kind, a, b = KIND[m.group(6)], int(m.group(4)), int(m.group(5) or m.group(4))
        one = m.group(9) or m.group(10)
        lo, hi = (int(m.group(7)), int(m.group(8))) if m.group(7) else ((int(one),) * 2 if one else (None, None))
        for n in range(a, b + 1):
            s = keys.get((kind, n))
            if not s:
                label = f"{n}{kind}" if kind in "회과쪽" else f"{kind.upper()} {n}"
                have = [x["name"] for x in book["sections"]]
                return None, f"이 단어장에는 '{label}' 범위가 없어요 (있는 범위: {have[0]} ~ {have[-1]})"
            if lo is None: items = s["items"]
            else:
                # 번호가 그 구역 안의 번호와 맞으면 그 번호로, 아니면 구역 안에서 몇 번째인지로 (Day 6 = 101~120번인 단어장)
                items = [i for i in s["items"] if isinstance(i["no"], int) and lo <= i["no"] <= hi] or s["items"][lo - 1:hi]
            found.append((s["name"], lo, hi, items))
    if not found:
        return None, f"범위를 알아보지 못했어요. 예: {'4회 11~20번' if '회' in kinds else 'unit 5'}"
    out = []
    for name, lo, hi, items in found:
        for i in items:
            m, tags = clean_meaning(i["m"])
            out.append({"from": name, "no": i["no"], "word": clean_word(i["w"]), "meaning": m, "pos": tags})
    return out, None

if __name__ == "__main__":
    book = json.load(open(sys.argv[1], encoding="utf-8"))
    for q in sys.argv[2:]:
        r, err = resolve(book, q)
        print(f"\n▶ {book['book']} · \"{q}\"" + (f"  → {err}" if err else f"  → {len(r)}개"))
        for x in r or []: print(f"   {x['from']} {x['no']:>2}. {x['word']} | {x['meaning']}" + (f"   [품사 {','.join(x['pos'])}]" if x['pos'] else ""))
