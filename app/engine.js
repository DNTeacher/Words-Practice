// 발음 엔진: Kokoro(AI 음성) + Whisper(음성인식) 를 브라우저 안에서 돌린다.
// 단어마다 음성을 만들고, 음성인식으로 다시 받아적어 같은 소리인지 확인한다.
// 무거운 AI 계산은 worker.js(따로 도는 일꾼)에서 한다 → 화면이 멈추지 않는다 (2026-10-30, 크롬 '페이지 응답 없음' 해결).

import { Lexicon, guessVariant, espeakToKokoro, soundKey } from "./g2p.js?v=5";
import * as A from "./audio.js?v=5";

const PHONEMIZER = "https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/+esm";
export const VOICE = "af_heart";
// 보통 빠르기 하나만 (2026-10-29 선생님 결정). 느린 음성이 다시 필요하면 ["very_slow", 0.7], ["slow", 0.85] 를 앞에 추가.
export const SPEEDS = [["normal", 1.0]];

// ---------- 숫자 (음성인식이 thirteen 을 13 으로 적는 경우) ----------
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = ",,twenty,thirty,forty,fifty,sixty,seventy,eighty,ninety".split(",");
function numWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numWords(n % 100) : "");
  return String(n);
}
function tokens(text) {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").trim().split(/\s+/).filter(Boolean)
    .flatMap(t => /^\d+$/.test(t) ? numWords(+t).split(" ") : [t]);
}
const plain = s => tokens(s).join(" ");

export class Engine {
  constructor() {
    this.lex = null; this.device = null; this._phon = null;
    this.worker = null; this._pending = new Map(); this._seq = 0;
  }

  async loadDict(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("발음 사전을 불러오지 못했어요");
    this.lex = new Lexicon(await r.json());
  }

  _call(type, payload = {}, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++this._seq;
      this._pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload }, transfer);
    });
  }

  // AI 모델 불러오기 (일꾼 안에서). onProgress(0~1, 설명)
  async loadModels(onProgress = () => {}) {
    this.worker = new Worker(new URL("./worker.js?v=5", import.meta.url), { type: "module" });
    this.worker.onmessage = e => {
      const d = e.data;
      if (d.type === "progress") return onProgress(d.p, d.txt);
      const p = this._pending.get(d.id); if (!p) return;
      this._pending.delete(d.id);
      d.ok ? p.resolve(d) : p.reject(new Error(d.error));
    };
    this.worker.onerror = e => {
      const err = new Error("AI 일꾼을 시작하지 못했어요" + (e && e.message ? ": " + e.message : ""));
      for (const p of this._pending.values()) p.reject(err);
      this._pending.clear();
    };
    let forceWasm = false;
    try { forceWasm = localStorage.getItem("wp-force-wasm") === "1"; } catch (e) {}
    const r = await this._call("load", { forceWasm });
    this.device = r.device;
    onProgress(1, "준비 완료");
  }

  async synth(ps, speed = 1) {
    return (await this._call("synth", { ps, speed })).audio;
  }

  async transcribe(a24) {
    const a16 = A.to16k(a24);
    return (await this._call("asr", { audio: a16 }, [a16.buffer])).text;
  }

  // 사전에 없는 단어: espeak 규칙으로 발음을 만든다
  async espeak(text) {
    if (!this._phon) this._phon = await import(PHONEMIZER);
    const out = await this._phon.phonemize(text, "en-us");
    return espeakToKokoro((Array.isArray(out) ? out.join(" ") : String(out)));
  }

  // ---------- 단어 준비 ----------
  // 입력 한 줄 → 단어 항목 (발음 결정)
  async prepare(item) {
    item.variants = this.lex.variants(item.word);
    if (item.variants) {
      if (item.choice == null) { item.choice = guessVariant(item.variants, item.meaning); item.guessed = true; }
      item.ps = item.variants[item.choice].ps;
      item.source = "dict";
    } else {
      const r = this.lex.phrase(item.word);
      if (r.ps) { item.ps = r.ps; item.source = "dict"; }
      else {
        item.missing = r.missing;
        try { item.ps = await this.espeak(item.word); item.source = "espeak"; }
        catch (e) { console.error(e); item.ps = null; item.source = "none"; }
      }
    }
    return item;
  }

  // 같은 소리로 들렸는지
  heardOk(item, heard) {
    const t = tokens(heard);
    if (!t.length) return false;
    if (t.join(" ") === plain(item.word)) return true;
    const parts = t.map(w => this.lex.word(w));
    if (parts.some(p => p == null)) return false;
    return soundKey(parts.join("")) === soundKey(item.ps);
  }

  // 단어 하나의 음성 만들기 (SPEEDS 에 느린 빠르기가 있으면 그것도. baseSpeed: '다시 만들기' 때 조금 다른 빠르기로)
  async makeAudio(item) {
    item.base = await this.synth(item.ps, item.baseSpeed || 1);
    item.audio = { normal: A.finish(item.base) };
    item.method = { normal: "kokoro" };
    for (const [key, t] of SPEEDS) {
      if (key === "normal") continue;
      item.audio[key] = A.finish(A.SLOW_METHODS[0].make(item.base, t));
      item.method[key] = A.SLOW_METHODS[0].id;
    }
    item.check = {};
  }

  // 여러 단어를 묶어 한 번에 받아적고(빠름), 맞지 않은 단어만 하나씩 다시 확인한다.
  async verify(items, key, onStep = () => {}) {
    const groups = [];
    let cur = [], dur = 0;
    for (const it of items) {
      const d = it.audio[key].length / A.SR + 0.8;
      if (cur.length && (cur.length >= 8 || dur + d > 24)) { groups.push(cur); cur = []; dur = 0; }
      cur.push(it); dur += d;
    }
    if (cur.length) groups.push(cur);
    for (const g of groups) {
      const heard = g.length > 1 ? await this.transcribe(A.concatWithGaps(g.map(it => it.audio[key]))) : null;
      const matched = heard != null ? this._align(g, heard) : new Map();
      for (const it of g) if (matched.has(it)) it.check[key] = { ok: true, heard: matched.get(it) };
      onStep();
    }
    const t = Object.fromEntries(SPEEDS)[key];
    for (const it of items) {
      if (it.check[key]) continue;
      let heard = await this.transcribe(it.audio[key]);
      let ok = this.heardOk(it, heard) || (key !== "normal" && it.check.normal?.heard && plain(heard) === plain(it.check.normal.heard));
      if (!ok && key !== "normal") {
        for (const m of A.SLOW_METHODS.slice(1)) {
          const a = A.finish(m.make(it.base, t));
          const h = await this.transcribe(a);
          if (this.heardOk(it, h)) { it.audio[key] = a; it.method[key] = m.id; heard = h; ok = true; break; }
        }
      }
      it.check[key] = { ok, heard };
      onStep();
    }
  }

  // 묶음 받아쓰기 결과를 단어 순서에 맞춰 짝짓기 (단어 하나가 1~3 낱말로 들릴 수 있음)
  _align(group, heard) {
    const toks = tokens(heard), n = group.length, m = toks.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
    dp[0][0] = 0;
    const upd = (i, j, v, b) => { if (i <= n && j <= m && v > dp[i][j]) { dp[i][j] = v; back[i][j] = b; } };
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
      const v = dp[i][j]; if (v < 0) continue;
      if (i < n) upd(i + 1, j, v, [i, j, 0]);
      if (j < m) upd(i, j + 1, v, [i, j, -1]);
      if (i < n) for (let k = 1; k <= 3 && j + k <= m; k++) {
        if (this.heardOk(group[i], toks.slice(j, j + k).join(" "))) upd(i + 1, j + k, v + 1, [i, j, k]);
      }
    }
    const matched = new Map();
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const b = back[i][j]; if (!b) break;
      if (b[2] > 0) matched.set(group[b[0]], toks.slice(b[1], b[1] + b[2]).join(" "));
      [i, j] = [b[0], b[1]];
    }
    return matched;
  }
}

export { plain };

export function itemState(it) {
  if (!it.check || !it.audio) return "pending";
  const ks = SPEEDS.map(([k]) => k);
  if (ks.some(k => !it.check[k])) return "pending";
  return ks.every(k => it.check[k].ok) ? "ok" : "warn";
}
