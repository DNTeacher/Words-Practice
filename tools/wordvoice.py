"""단어 발음 음성 생성기 (Kokoro TTS + misaki 미국식 발음 사전).

각 단어의 발음 기호(Kokoro 음소)를 사전에서 찾고, 뜻에 따라 발음이 달라지는
단어는 품사 힌트(pos)나 직접 지정한 음소(ipa)로 정확한 발음을 고른다.
"""
import sys, types, os, re, subprocess, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "misaki"))

# misaki.en 이 불러오지만 사전 조회에는 쓰지 않는 무거운 패키지들을 빈 모듈로 대체
for name in ["spacy", "num2words", "transformers", "torch", "addict", "regex"]:
    if name not in sys.modules:
        m = types.ModuleType(name)
        if name == "num2words":
            m.num2words = lambda *a, **k: ""
        if name == "transformers":
            m.BartForConditionalGeneration = object
        if name == "addict":
            m.Dict = dict
        if name == "regex":  # 문장 분할용 (사전 조회에는 사용 안 함)
            m.compile = lambda *a, **k: None
        m._wordvoice_stub = True
        sys.modules[name] = m

from misaki import en as _en  # noqa: E402
import onnxruntime as ort  # noqa: E402

# 빈 모듈이 다른 라이브러리(scipy 등)를 헷갈리게 하지 않도록 바로 치운다
for name in ["spacy", "num2words", "transformers", "torch", "addict", "regex"]:
    if getattr(sys.modules.get(name), "_wordvoice_stub", False):
        sys.modules.pop(name, None)

SR = 24000
_LEX = None
_SESS = None
_VOICES = None
_VOCAB = None


def lexicon():
    global _LEX
    if _LEX is None:
        _LEX = _en.Lexicon(british=False)
    return _LEX


def phonemes_for(text, pos=None):
    """단어/구의 Kokoro 음소. 모르는 단어가 있으면 None."""
    lex = lexicon()
    parts = []
    for w in re.findall(r"[A-Za-z']+|[-]", text):
        if w == "-":
            continue
        ps, _ = lex.get_word(w, pos, None, _en.TokenContext())
        if ps is None:
            ps, _ = lex.get_word(w.lower(), pos, None, _en.TokenContext())
        if ps is None:
            return None
        parts.append(ps)
    return " ".join(parts) if parts else None


def variants(word):
    """사전에 등록된 발음 후보 (뜻/품사별)."""
    lex = lexicon()
    for d in (lex.golds, lex.silvers):
        v = d.get(word) or d.get(word.lower())
        if v is not None:
            return v
    return None


def _load():
    global _SESS, _VOICES, _VOCAB
    if _SESS is None:
        import json
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = os.cpu_count() or 2
        _SESS = ort.InferenceSession(os.path.join(HERE, "kokoro-v1.0.onnx"), opts,
                                     providers=["CPUExecutionProvider"])
        _VOICES = np.load(os.path.join(HERE, "voices-v1.0.bin"))
        cfg = json.load(open(os.path.join(HERE, "kokoro-onnx/src/kokoro_onnx/config.json")))
        _VOCAB = cfg["vocab"]


def synth(ps, voice="af_heart", speed=1.0):
    """음소 문자열 → 24kHz float32 오디오."""
    _load()
    toks = [_VOCAB[c] for c in ps if c in _VOCAB]
    style = _VOICES[voice][min(len(toks), 510) - 1]
    out = _SESS.run(None, {
        "tokens": np.array([[0, *toks, 0]], dtype=np.int64),
        "style": np.asarray(style, dtype=np.float32),
        "speed": np.array([speed], dtype=np.float32),
    })
    a = np.asarray(out[0]).ravel().astype(np.float32)
    return clear_s_onset(a) if S_ONSET.match(ps) else a


# s + p/t/k 로 시작하는 단어 (spice, space, sky, street): 첫 s 에 섞인 목소리를 뺀다 (2026-11-11). app/audio.js clearSOnset 과 같은 계산.
S_ONSET = re.compile(r"^[ˈˌ]?s[ptk]")
_HP_Q = (0.5176381, 0.7071068, 1.9318517)


def _highpass(x, fc, sr):
    y = np.array(x, dtype=np.float64)
    w0 = 2 * np.pi * fc / sr; cs, sn = np.cos(w0), np.sin(w0)
    from scipy.signal import lfilter
    def run(y, q):
        al = sn / (2 * q); a0 = 1 + al
        b = [(1 + cs) / 2 / a0, -(1 + cs) / a0, (1 + cs) / 2 / a0]
        return lfilter(b, [1, -2 * cs / a0, (1 - al) / a0], y)
    for q in _HP_Q:
        y = run(y, q)
    y = y[::-1]
    for q in _HP_Q:
        y = run(y, q)
    return y[::-1].astype(np.float32)


def clear_s_onset(a, sr=SR, cut=2500):
    hop = round(sr * 0.005); nf = (len(a) - hop) // hop
    if nf < 20:
        return a
    db = np.array([20 * np.log10(np.sqrt(np.mean(np.square(a[f * hop:f * hop + hop], dtype=np.float64))) + 1e-9) for f in range(nf)])
    start = int(np.argmax(db > db.max() - 40))
    lo, hi = start + 6, min(start + 50, nf)
    if lo >= hi:
        return a
    gap = lo + int(np.argmin(db[lo:hi]))
    if not db[gap] < db[start:gap].max() - 10:
        return a
    s_end, xf = gap * hop, 2 * hop
    h = _highpass(a[:min(len(a), s_end + xf)], cut, sr)
    out = np.array(a, dtype=np.float32)
    out[:s_end] = h[:s_end]
    n = min(xf, len(h) - s_end)
    g = 1 - np.arange(n) / xf
    out[s_end:s_end + n] = h[s_end:s_end + n] * g + a[s_end:s_end + n] * (1 - g)
    return out


def trim_and_pad(a, lead=0.12, tail=0.15, thresh_db=-55):
    """앞뒤 무음을 정리하고, 휴대폰에서 첫소리가 잘리지 않게 짧은 여백을 붙인다."""
    env = np.convolve(np.abs(a), np.ones(240) / 240, mode="same")
    thr = 10 ** (thresh_db / 20) * max(env.max(), 1e-6)
    idx = np.where(env > thr)[0]
    if len(idx):
        s = max(0, idx[0] - int(0.06 * SR))
        e = min(len(a), idx[-1] + int(0.08 * SR))
        a = a[s:e]
    fade = int(0.008 * SR)
    if len(a) > 2 * fade:
        a[:fade] *= np.linspace(0, 1, fade)
        a[-fade:] *= np.linspace(1, 0, fade)
    return np.concatenate([np.zeros(int(lead * SR)), a, np.zeros(int(tail * SR))]).astype(np.float32)


def normalize(a, peak_db=-1.5, target_rms_db=-18):
    """단어마다 소리 크기가 비슷하도록 맞춘다 (피크 제한 포함)."""
    rms = np.sqrt(np.mean(a[np.abs(a) > 1e-4] ** 2)) if np.any(np.abs(a) > 1e-4) else 1e-4
    g = 10 ** (target_rms_db / 20) / max(rms, 1e-6)
    peak = np.abs(a).max() * g
    lim = 10 ** (peak_db / 20)
    if peak > lim:
        g *= lim / peak
    return (a * g).astype(np.float32)


def to_mp3(a, path, kbps=48):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav = f.name
    import scipy.io.wavfile as wf
    wf.write(wav, SR, (np.clip(a, -1, 1) * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1",
                    "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", f"{kbps}k", path], check=True)
    os.unlink(wav)


def to_wav(a, path, sr_out=16000):
    import scipy.io.wavfile as wf
    from scipy.signal import resample_poly
    b = resample_poly(a, sr_out, SR) if sr_out != SR else a
    wf.write(path, sr_out, (np.clip(b, -1, 1) * 32767).astype(np.int16))


def stretch(a, tempo):
    """음 높이는 그대로 두고 빠르기만 바꾼다 (ffmpeg atempo).

    Kokoro 자체 속도 옵션으로 느리게 만들면 단어 앞에 'a' 같은 소리가 섞이거나
    자음이 늘어져 다른 단어처럼 들리는 경우가 있어(음성인식 검증 0/16),
    자연스러운 보통 속도 음성을 만든 뒤 늘리는 방식을 쓴다 (검증 74/74).
    """
    if abs(tempo - 1.0) < 1e-3:
        return a
    import scipy.io.wavfile as wf
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, "i.wav"), os.path.join(d, "o.wav")
        wf.write(i, SR, (np.clip(a, -1, 1) * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", i, "-af", f"atempo={tempo}", o], check=True)
        return wf.read(o)[1].astype(np.float32) / 32767


def stretch_rb(a, tempo, opts="transients=crisp:pitchq=quality"):
    """rubberband 로 빠르기만 바꾸는 다른 방식 (단어에 따라 이쪽이 더 또렷할 때가 있음)."""
    import scipy.io.wavfile as wf
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, "i.wav"), os.path.join(d, "o.wav")
        wf.write(i, SR, (np.clip(a, -1, 1) * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", i, "-af", f"rubberband=tempo={tempo}:{opts}", o], check=True)
        return wf.read(o)[1].astype(np.float32) / 32767


def slow_candidates(ps, voice, tempo):
    """느린 음성 후보들 (앞쪽이 기본). 음성인식 검증에서 처음 통과한 것을 쓴다."""
    base = _base(ps, voice)
    yield "atempo", lambda: stretch(base, tempo)
    yield "rb-crisp", lambda: stretch_rb(base, tempo, "transients=crisp:pitchq=quality")
    yield "rb-mixed", lambda: stretch_rb(base, tempo, "transients=mixed:window=short")
    yield "k0.9+atempo", lambda: stretch(synth(ps, voice, 0.9), tempo / 0.9)


def finish(a):
    return normalize(trim_and_pad(a.copy()))


def _base(ps, voice):
    key = (ps, voice)
    if key not in _BASE_CACHE:
        _BASE_CACHE[key] = synth(ps, voice, 1.0)
    return _BASE_CACHE[key]


_BASE_CACHE = {}


def make_word_audio(ps, voice="af_heart", tempo=1.0):
    """단어 하나의 음성. 끝에 마침표를 붙이지 않는다 (붙이면 knife→knives처럼 꼬리가 생김)."""
    key = (ps, voice)
    if key not in _BASE_CACHE:
        _BASE_CACHE[key] = synth(ps, voice, 1.0)
    a = stretch(_BASE_CACHE[key], tempo)
    return normalize(trim_and_pad(a.copy()))
