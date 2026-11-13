"""GitHub Pages 용 반별 단어장 사이트 만들기.

구조 (폴더 없이 저장소 맨 위에 파일만 둔다 → 손으로 올릴 때도 끌어다 놓기만 하면 됨):
  index.html             첫 화면: 반 목록
  e3a.html               반 고정 주소: 그 반 최신 단어장 + 아래에 지난 단어장 목록 (없으면 안내 화면)
  e3a-2026-10-30.html    날짜별 단어장 (반 최신 단어장으로 가는 링크 포함)
  classes.json 의 반 목록을 기준으로 만든다.

사용법:
  python3 make_site.py --repo <저장소 폴더> [out/e3a-2026-10-30.html ...] [--zip 업로드.zip]
    - 주어진 단어장(build.py 결과)을 날짜별 파일로 넣고, 모든 반 페이지와 첫 화면을 다시 만든다.
    - 저장소 폴더가 git clone 이면 바뀐/새 파일 목록을 보여 주고, --zip 이면 그 파일들만 압축한다.
"""
import argparse, glob, html, json, os, re, subprocess, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

HEAD_BASE = """<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="format-detection" content="telephone=no">
{og}
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>"""

DATA_RE = re.compile(r"const DATA = ([^\n]*);\n")
# 반코드-YYYY-MM-DD.html, 같은 날 두 번째 단어장부터 반코드-YYYY-MM-DD-2.html …
DATED_RE = re.compile(r"^([a-z0-9]+)-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.html$")


def load_classes(repo=None):
    """반 목록. 저장소의 classes.json 이 기준이다 (웹앱에서 반을 추가하면 저장소 쪽이 바뀜)."""
    for p in ([os.path.join(repo, "classes.json")] if repo else []) + [os.path.join(HERE, "classes.json")]:
        if os.path.exists(p):
            return json.load(open(p, encoding="utf-8"))
    raise SystemExit("classes.json 을 찾지 못했습니다")


# 서비스 이름 (2026-11-03 선생님이 정함: 들어볼까 + Voca). 앱 site.js 의 BRAND 와 같아야 한다.
BRAND = "들어Voca"


def og_tags(title, desc, url=None):
    t = ['<meta property="og:type" content="website">',
         f'<meta property="og:title" content="{html.escape(title)}">',
         f'<meta property="og:description" content="{html.escape(desc)}">']
    if url:
        t.append(f'<meta property="og:url" content="{html.escape(url)}">')
    return "\n".join(t)


def get_data(doc):
    return json.loads(DATA_RE.search(doc).group(1))


def set_data(doc, data):
    js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return DATA_RE.sub(lambda m: f"const DATA = {js};\n", doc, count=1)


def set_head(doc, title, desc, url=None):
    doc = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", doc, count=1, flags=re.S)
    doc = re.sub(r'(?:<meta property="og:[a-z]+" content="[^"]*">\n?)+', og_tags(title, desc, url) + "\n", doc, count=1)
    return doc


def standalone(body_html, title, desc, url=None):
    """Claude 페이지용 본문(<title>…<style>…</style><div class="wrap">…)을 완전한 웹 문서로."""
    body_html = re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\s*', "", body_html)
    i = body_html.find('<div class="wrap">')
    head_part, rest = body_html[:i], body_html[i:]
    head = HEAD_BASE.format(og=og_tags(title, desc, url)) + "\n" + head_part.strip()
    return f'<!doctype html>\n<html lang="ko">\n<head>\n{head}\n</head>\n<body>\n{rest.strip()}\n</body>\n</html>\n'


LIST_CSS = """
:root {
  --paper: #EEF2F8; --sheet: #FFFFFF; --ink: #15213B; --ink-soft: #56637F; --rule: #DDE4EF;
  --accent: #2A55D3; --chip: #FFF4C2; --marker: #FFE14D;
  --shadow: 0 1px 0 rgba(21,33,59,.04), 0 8px 24px -12px rgba(21,33,59,.18);
  --f-ko: "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --paper: #0E1422; --sheet: #161E30; --ink: #EDF1F9; --ink-soft: #9CA8C2; --rule: #263049;
    --accent: #8EAEFF; --chip: #3A3418; --marker: rgba(255,214,64,.34);
    --shadow: 0 8px 24px -12px rgba(0,0,0,.6); color-scheme: dark; }
}
* { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font: 16px/1.5 var(--f-ko); -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
.wrap { max-width: 560px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 40px; }
.eyebrow { font-size: 13px; font-weight: 500; color: var(--ink-soft); letter-spacing: .02em; margin: 0 0 4px; }
h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.25; text-wrap: balance; }
.hint { margin: 0 0 18px; color: var(--ink-soft); font-size: 15px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.grid a { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 64px;
  padding: 14px 16px; background: var(--sheet); border-radius: 14px; box-shadow: var(--shadow);
  color: inherit; text-decoration: none; font-weight: 700; font-size: 18px; }
.grid a:active { background: color-mix(in srgb, var(--marker) 22%, var(--sheet)); }
.grid .go { color: var(--accent); font-size: 22px; line-height: 1; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.empty { background: var(--sheet); border-radius: 16px; box-shadow: var(--shadow); padding: 22px 20px; display: grid; gap: 6px; }
.empty b { font-size: 18px; }
.empty p { margin: 0; color: var(--ink-soft); }
.back { display: inline-block; margin-top: 18px; color: var(--accent); font-weight: 700; text-decoration: none; padding: 8px 0; }
"""

LIST_PAGE = """<!doctype html>
<html lang="ko">
<head>
{head}
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap">
<style>{css}</style>
</head>
<body>
<div class="wrap">
{body}
</div>
</body>
</html>
"""


def root_index(reg, base):
    items = "\n".join(
        f'    <li><a href="{c["code"]}.html"><span>{html.escape(c["name"])}</span><span class="go" aria-hidden="true">›</span></a></li>'
        for c in reg["classes"])
    body = f"""  <h1>{BRAND}</h1>
  <p class="hint">우리 반을 누르면 외울 단어와 발음이 나와요.</p>
  <ul class="grid">
{items}
  </ul>"""
    head = HEAD_BASE.format(og=og_tags(BRAND, "반을 고르면 외울 단어와 발음이 나와요", base))
    return LIST_PAGE.format(head=head, title=BRAND, css=LIST_CSS, body=body)


def empty_class_page(c, url):
    name = html.escape(c["name"])
    body = f"""  <p class="eyebrow">{BRAND}</p>
  <h1>{name} 단어장</h1>
  <p class="hint">이 주소에서 우리 반 단어를 들을 수 있어요.</p>
  <div class="empty">
    <b>아직 올라온 단어장이 없어요</b>
    <p>선생님이 단어장을 올리면 이 주소를 열자마자 바로 나와요.</p>
  </div>
  <a class="back" href="index.html">‹ 다른 반 보기</a>"""
    head = HEAD_BASE.format(og=og_tags(f"{BRAND} · {c['name']}", "단어를 누르면 발음이 나와요", url))
    return LIST_PAGE.format(head=head, title=f"{BRAND} · {name}", css=LIST_CSS, body=body)


def render_student(data, title, desc, url):
    """현재 template.html 로 학생 페이지를 그린다 (웹앱 app/student.html 과 같은 결과)."""
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    body = tpl.replace("__PAGE_TITLE__", html.escape(title)).replace("/*__WORDBOOK_DATA__*/null", js)
    return standalone(body, title, desc, url)


def dated_files(repo, code):
    """[(날짜, 순서, 경로, DATA)] 날짜 최신순, 같은 날짜는 올린 순서. 이동 안내 페이지(DATA 없음)는 뺀다."""
    out = []
    for p in glob.glob(os.path.join(repo, f"{code}-*.html")):
        m = DATED_RE.match(os.path.basename(p))
        if m and m.group(1) == code:
            doc = open(p, encoding="utf-8").read()
            if not DATA_RE.search(doc):
                continue
            out.append((m.group(2), int(m.group(3) or 1), p, get_data(doc)))
    out.sort(key=lambda t: (t[0], -t[1]), reverse=True)
    return out


def day_title(date, sets):
    if len(sets) == 1:
        return sets[0]["title"]
    y, mth, d = date.split("-")
    return f"{int(mth)}월 {int(d)}일 단어장"


def _parse_iso(t):
    """"2026-11-04T19:00:00+09:00" → epoch 초 (보이기 시작하는 때)."""
    from datetime import datetime
    return datetime.fromisoformat(t).timestamp()


def class_data_timeline(c, entries, now):
    """반 페이지 DATA. entries: [{href, date, title, n, words, showFrom}] (날짜 최신순, 같은 날짜는 올린 순서).
    예약(showFrom 이 지금보다 뒤)인 단어장은 지금 DATA 에는 없고, DATA.next = {at, data} 사슬에 그때의 반 페이지로 들어간다.
    웹앱 site.js _classFromEntries 와 같은 규칙."""
    order = {id(e): i for i, e in enumerate(entries)}
    future = sorted({e["showFrom"] for e in entries if e.get("showFrom") and _parse_iso(e["showFrom"]) > now}, key=_parse_iso)

    def state(t):
        vis = [e for e in entries if not e.get("showFrom") or _parse_iso(e["showFrom"]) <= t]
        vis.sort(key=lambda e: order[id(e)])
        vis.sort(key=lambda e: e["date"], reverse=True)
        d = {"date": None, "title": "", "sample": False, "cls": c["name"], "cls_code": c["code"], "sets": [], "past": []}
        if not vis:
            return d
        latest = vis[0]["date"]
        sets = [{"href": e["href"], "title": e["title"], "words": e["words"]} for e in vis if e["date"] == latest]
        d.update(date=latest, title=day_title(latest, sets), sets=sets,
                 past=[{"href": e["href"], "title": e["title"], "n": e["n"], "date": e["date"]} for e in vis if e["date"] != latest])
        return d

    data = state(now)
    tail = data
    for at in future:
        nd = state(_parse_iso(at))
        tail["next"] = {"at": at, "data": nd}
        tail = nd
    return data


def class_page(c, repo, url, now=None):
    import time
    now = time.time() if now is None else now
    files = dated_files(repo, c["code"])
    if not files:
        return empty_class_page(c, url), None
    entries = [{"href": os.path.basename(p), "date": dt, "title": d.get("title") or dt, "n": len(d.get("words", [])),
                "words": d.get("words", []), "showFrom": d.get("showFrom")} for dt, _, p, d in files]
    data = class_data_timeline(c, entries, now)
    sets = data["sets"]
    if data.get("next") or not sets:
        desc = "단어를 누르면 발음이 나와요"
    else:
        n = sum(len(st["words"]) for st in sets)
        desc = f"최신: {data['title']}" + (f" (단어장 {len(sets)}개)" if len(sets) > 1 else "") + f" · 단어 {n}개"
    return render_student(data, f"{BRAND} · {c['name']}", desc, url), data["date"]


def pick_name(repo, code, date, title):
    """같은 날짜에 같은 제목이 있으면 그 파일, 없으면 빈 이름 (-2, -3 …)."""
    same_day = [(seq, p, d) for dt, seq, p, d in dated_files(repo, code) if dt == date]
    for seq, p, d in same_day:
        if d.get("title") == title:
            return os.path.basename(p)
    k = 1
    while True:
        name = f"{code}-{date}.html" if k == 1 else f"{code}-{date}-{k}.html"
        if not os.path.exists(os.path.join(repo, name)):
            return name
        k += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="*", help="build.py 가 만든 out/반코드-날짜.html")
    ap.add_argument("--repo", required=True, help="GitHub 저장소 폴더 (git clone 한 곳)")
    ap.add_argument("--zip", default=None, help="바뀐 파일만 담은 업로드용 zip 경로")
    args = ap.parse_args()

    reg = load_classes(args.repo)
    base = reg["site"].rstrip("/") + "/"
    codes = {c["code"]: c for c in reg["classes"]}
    os.makedirs(args.repo, exist_ok=True)

    # 1) 날짜별 단어장
    for page in args.pages:
        body = open(page, encoding="utf-8").read()
        data = get_data(body)
        code = data.get("cls_code")
        if code not in codes:
            raise SystemExit(f"{page}: 반 정보가 없습니다 (단어장 파일에 \"class\" 를 넣고 build.py 를 다시 실행하세요)")
        name = pick_name(args.repo, code, data["date"], data.get("title", ""))
        data["home"] = f"{code}.html"
        data["cls"] = codes[code]["name"]
        title = f"{BRAND} · {codes[code]['name']} {data.get('title', '')}".strip()
        doc = render_student(data, title, f"단어를 누르면 발음이 나와요 · 단어 {len(data['words'])}개", base + name)
        open(os.path.join(args.repo, name), "w", encoding="utf-8").write(doc)
        print(f"단어장: {name}")

    # 2) 반 페이지 + 첫 화면
    summary = []
    for c in reg["classes"]:
        doc, latest = class_page(c, args.repo, base + f"{c['code']}.html")
        open(os.path.join(args.repo, f"{c['code']}.html"), "w", encoding="utf-8").write(doc)
        summary.append(f"  {c['name']:<6} {base}{c['code']}.html   최신: {latest or '없음'}")
    open(os.path.join(args.repo, "index.html"), "w", encoding="utf-8").write(root_index(reg, base))
    print("반 주소:")
    print("\n".join(summary))

    # 3) 바뀐 파일
    if os.path.isdir(os.path.join(args.repo, ".git")):
        st = subprocess.run(["git", "-C", args.repo, "status", "--porcelain", "--untracked-files=all"],
                            capture_output=True, text=True).stdout
        changed = sorted(line[3:].strip().strip('"') for line in st.splitlines() if line.strip())
        print(f"\n바뀐/새 파일 {len(changed)}개: " + ", ".join(changed))
        if args.zip and changed:
            with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_DEFLATED) as z:
                for f in changed:
                    z.write(os.path.join(args.repo, f), f)
            print(f"업로드용 압축: {args.zip}")


if __name__ == "__main__":
    main()
