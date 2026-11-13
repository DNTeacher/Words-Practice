"""단어장 JSON → 학생용 발음 듣기 페이지(HTML) 생성.

사용법:
  python3 build.py sets/2026-10-29.json             # 발음 확인 + 음성 생성 + 음성인식 검증 + 페이지
  python3 build.py sets/2026-10-29.json --no-asr    # 검증 없이 (음성인식 도구가 없을 때)

단어장 파일:
  {"class": "e3a", "date": "2026-10-30", "title": "10월 30일 영어 단어", "words": [...]}
  class 는 classes.json 의 반 코드(또는 반 이름). 있으면 결과는 out/e3a-2026-10-30.html.

단어 항목:
  {"word": "read", "meaning": "읽었다", "pos": "VBD"}
    pos  : 뜻에 맞는 품사 힌트 (DEFAULT / VERB / NOUN / ADJ / VBD / VBN ...)
    ipa  : 직접 지정한 Kokoro 음소 (사전에 없거나 사전에 원하는 발음이 없을 때)
  뜻에 따라 발음이 달라지는 단어는 pos 또는 ipa 가 없으면 생성을 멈춘다.

음성: 보통 속도는 Kokoro(af_heart)로 만들고, 천천히/아주 천천히는 그 음성을
음 높이 그대로 늘려서 만든다. 음성인식(Parakeet)으로 되받아 적어 보고,
느린 음성이 다른 단어처럼 들리면 다른 늘리기 방식으로 자동 교체한다.
"""
import argparse, base64, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.environ.get("WORDVOICE_DIR", os.path.expanduser("~/tts"))
ASR_DIR = os.environ.get("WORDVOICE_ASR", os.path.expanduser("~/asr"))
sys.path.insert(0, TTS_DIR)
import wordvoice as wv  # noqa: E402

# 보통 빠르기 하나만 (2026-10-29 선생님 결정). 느린 음성이 다시 필요하면 ("very_slow", 0.7), ("slow", 0.85) 를 앞에 추가.
SPEEDS = [("normal", 1.0)]
VOICE = "af_heart"  # 미국 영어 여성 음성

# 사전에 한 가지 발음만 있지만 뜻에 따라 발음이 달라지는 단어 (확인 필수)
EXTRA_HETERONYMS = {
    "lead": "이끌다 lˈid · 납 lˈɛd",
    "bass": "베이스(음) bˈAs · 농어 bˈæs",
    "dove": "비둘기 dˈʌv · dive의 과거 dˈOv",
    "does": "하다 dˈʌz · 암사슴들 dˈOz",
    "row": "줄 ɹˈO · 말다툼 ɹˈW",
    "sow": "씨 뿌리다 sˈO · 암퇘지 sˈW",
    "wound": "상처 wˈund · wind의 과거 wˈWnd",
    "house": "집 hˈWs · 수용하다 hˈWz",
    "excuse": "변명 ɪkskjˈus · 용서하다 ɪkskjˈuz",
    "polish": "닦다 pˈɑlɪʃ · 폴란드의(Polish) pˈOlɪʃ",
    "lives": "삶들 lˈIvz · 살다 lˈɪvz",
    "tears": "눈물 tˈɪɹz · 찢다 tˈɛɹz",
    "winds": "바람 wˈɪndz · 감다 wˈIndz",
    "bow": "활 bˈO · 절하다 bˈW",
}


def class_info(code):
    """classes.json 에서 반 이름을 찾는다. 반 코드(e3a)나 반 이름(초3A반) 모두 받는다."""
    repo = os.environ.get("WORDBOOK_REPO", "/home/claude/words-practice")
    path = os.path.join(repo, "classes.json")
    if not os.path.exists(path):
        path = os.path.join(HERE, "classes.json")
    reg = json.load(open(path, encoding="utf-8"))
    for c in reg["classes"]:
        if code in (c["code"], c["name"]):
            return c
    raise SystemExit(f"classes.json 에 '{code}' 반이 없습니다. 반을 먼저 추가하세요.")


def resolve(entry):
    """단어의 최종 음소. 뜻 확인이 필요하면 오류 메시지를 돌려준다."""
    word = entry["word"].strip()
    if entry.get("ipa"):
        return entry["ipa"], None
    variants = wv.variants(word)
    pos = entry.get("pos")
    multi = isinstance(variants, dict) and len(set(v for v in variants.values() if v)) > 1
    if (multi or word.lower() in EXTRA_HETERONYMS) and not pos:
        opts = variants if multi else EXTRA_HETERONYMS[word.lower()]
        return None, f"'{word}' 은(는) 뜻에 따라 발음이 다릅니다. 뜻 '{entry.get('meaning','')}' 에 맞게 pos 또는 ipa 를 지정하세요: {opts}"
    if word.lower() in EXTRA_HETERONYMS and pos == "DEFAULT":
        pass  # 사전 기본 발음이 뜻과 맞다고 확인한 경우
    ps = wv.phonemes_for(word, None if pos == "DEFAULT" else pos)
    if ps is None:
        return None, f"'{word}' 은(는) 발음 사전에 없습니다. ipa 를 직접 지정하세요."
    return ps, None


# ---------- 음성인식 검증 ----------
def asr_available():
    return os.path.exists(_asr_bin()) and os.path.isdir(_asr_model())


def _asr_bin():
    return os.path.join(ASR_DIR, "sherpa-onnx-v1.12.15-linux-x64-static/bin/sherpa-onnx-offline")


def _asr_model():
    return os.path.join(ASR_DIR, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8")


def transcribe(audios, workdir):
    """{id: audio} → {id: 받아적은 글}"""
    if not audios:
        return {}
    md = _asr_model()
    paths = {}
    for k, a in audios.items():
        p = os.path.join(workdir, f"asr_{len(paths):04d}.wav")
        wv.to_wav(a, p)
        paths[k] = p
    cmd = [_asr_bin(), f"--encoder={md}/encoder.int8.onnx", f"--decoder={md}/decoder.int8.onnx",
           f"--joiner={md}/joiner.int8.onnx", f"--tokens={md}/tokens.txt",
           "--model-type=nemo_transducer", f"--num-threads={os.cpu_count() or 2}"] + list(paths.values())
    out = subprocess.run(cmd, capture_output=True, text=True)
    log = out.stdout + out.stderr
    res = {}
    for k, p in paths.items():
        m = re.search(re.escape(p) + r'\s*\n\s*(\{.*?\})\s*\n', log, re.S)
        res[k] = json.loads(m.group(1)).get("text", "").strip() if m else "?"
    return res


NUM = {"13": "thirteen", "14": "fourteen", "15": "fifteen", "16": "sixteen", "17": "seventeen",
       "18": "eighteen", "19": "nineteen", "20": "twenty", "30": "thirty", "40": "forty", "50": "fifty",
       "60": "sixty", "70": "seventy", "80": "eighty", "90": "ninety", "100": "one hundred"}


def norm(s):
    s = s.lower().strip().rstrip(".!?")
    s = NUM.get(s, s)  # 음성인식이 숫자로 받아쓴 경우
    return re.sub(r"[^a-z ]", "", s).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("set_json")
    ap.add_argument("--out", default=None)
    ap.add_argument("--no-asr", action="store_true")
    ap.add_argument("--template", default=os.path.join(HERE, "template.html"))
    args = ap.parse_args()

    data = json.load(open(args.set_json, encoding="utf-8"))
    words = data["words"]

    # 1) 발음 결정
    errors = []
    for e in words:
        e["_ps"], err = resolve(e)
        if err:
            errors.append(err)
    print("발음 확인:")
    for i, e in enumerate(words, 1):
        tag = e.get("pos") or ("ipa" if e.get("ipa") else "")
        print(f"  {i:2d}. {e['word']:<16} {e.get('meaning',''):<22} {e['_ps'] or '-':<16} {tag}")
    if errors:
        print("\n확인이 필요한 단어:")
        for er in errors:
            print("  - " + er)
        sys.exit(2)

    use_asr = not args.no_asr and asr_available()
    if not args.no_asr and not use_asr:
        print("\n(음성인식 도구가 없어 검증 없이 만듭니다)")
    tmp = tempfile.mkdtemp()

    # 2) 보통 속도 음성
    for e in words:
        e["_audio"] = {"normal": wv.finish(wv._base(e["_ps"], VOICE))}
        e["_how"] = {"normal": "kokoro"}

    heard_normal = {}
    if use_asr:
        heard_normal = transcribe({i: e["_audio"]["normal"] for i, e in enumerate(words)}, tmp)

    def accept(i, txt):
        e = words[i]
        return norm(txt) == norm(e["word"]) or (heard_normal.get(i) and norm(txt) == norm(heard_normal[i]))

    # 3) 느린 음성: 후보를 차례로 시도해 음성인식이 같은 단어로 알아들은 것을 고른다
    for key, tempo in SPEEDS:
        if key == "normal":
            continue
        pending = {i: list(wv.slow_candidates(e["_ps"], VOICE, tempo)) for i, e in enumerate(words)}
        chosen = {}
        round_no = 0
        while pending:
            batch = {}
            for i, cands in pending.items():
                name, make = cands[0]
                a = wv.finish(make())
                batch[i] = a
                if i not in chosen:  # 첫 후보를 기본값으로
                    chosen[i] = (name, a, None)
            if not use_asr:
                break
            heard = transcribe(batch, tmp)
            nxt = {}
            for i, a in batch.items():
                name = pending[i][0][0]
                if accept(i, heard[i]):
                    chosen[i] = (name, a, heard[i])
                elif len(pending[i]) > 1:
                    if round_no == 0:
                        chosen[i] = (name, a, heard[i])
                    nxt[i] = pending[i][1:]
                else:
                    if chosen[i][2] is None:
                        chosen[i] = (chosen[i][0], chosen[i][1], heard[i])
            pending = nxt
            round_no += 1
        for i, (name, a, txt) in chosen.items():
            words[i]["_audio"][key] = a
            words[i]["_how"][key] = name
            words[i].setdefault("_heard", {})[key] = txt

    # 4) mp3 로 묶기
    for e in words:
        e["audio"] = {}
        for key, _ in SPEEDS:
            mp3 = os.path.join(tmp, "x.mp3")
            wv.to_mp3(e["_audio"][key], mp3)
            e["audio"][key] = base64.b64encode(open(mp3, "rb").read()).decode()

    if use_asr:
        print("\n음성인식 검증 (AI 음성을 다시 받아적은 결과):")
        review = []
        for i, e in enumerate(words):
            heard = [heard_normal.get(i, "?")] + [(e.get("_heard") or {}).get(k) or "?" for k, _ in SPEEDS if k != "normal"]
            ok = [accept(i, h) for h in heard]
            mark = "✓" if norm(heard[0]) == norm(e["word"]) and all(ok) else "△" if all(ok) else "?"
            how = "" if all(v in ("kokoro", "atempo") for v in e["_how"].values()) else f"  (느린 음성 방식 교체: {e['_how']})"
            print(f"  {mark} {e['word']:<14} → {' / '.join(heard)}{how}")
            if mark != "✓":
                review.append(e["word"])
        if review:
            print("  △ = 뜻에 맞춰 고른 발음이라 철자와 다르게 받아적힘(예: read 과거형→red) 또는 철자 표기 차이")
            print("  ? = 다르게 들릴 수 있음, 직접 들어 확인 필요")

    # 5) 페이지
    payload = {
        "date": data.get("date"),
        "title": data.get("title"),
        "sample": bool(data.get("sample")),
        "words": [{"w": e["word"], "m": e.get("meaning", ""), "a": e["audio"]} for e in words],
    }
    page_title = data.get("title", "영어 단어")
    out_name = os.path.splitext(os.path.basename(args.set_json))[0] + ".html"
    if data.get("class"):
        cls = class_info(data["class"])
        payload["cls"], payload["cls_code"] = cls["name"], cls["code"]
        page_title = f"{cls['name']} {page_title}"
        out_name = f"{cls['code']}-{data['date']}.html"
    js = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    html = open(args.template, encoding="utf-8").read()
    html = html.replace("__PAGE_TITLE__", page_title)
    html = html.replace("/*__WORDBOOK_DATA__*/null", js)
    out = args.out or os.path.join(HERE, "out", out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(html)
    print(f"\n페이지: {out} ({os.path.getsize(out)/1024:.0f} KB, 단어 {len(words)}개)")


if __name__ == "__main__":
    main()
