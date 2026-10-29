// 발음 엔진: Kokoro(AI 음성) + Whisper(음성인식) 를 브라우저 안에서 돌린다.
// 단어마다 보통/천천히/아주 천천히 음성을 만들고, 음성인식으로 다시 받아적어 같은 소리인지 확인한다.

import { Lexicon, guessVariant, espeakToKokoro, soundKey } from "./g2p.js";
import * as A from "./audio.js";

const TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";
const PHONEMIZER = "https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/+esm";
const KOKORO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const ASR_MODEL = "onnx-community/whisper-base.en";
export const VOICE = "af_heart";
export const SPEEDS = [["very_slow", 0.7], ["slow", 0.85], ["normal", 1.0]];

const VOCAB = {";":1,":":2,",":3,".":4,"!":5,"?":6,"—":9,"…":10,"\"":11,"(":12,")":13,"“":14,"”":15," ":16,"̃":17,"ʣ":18,"ʥ":19,"ʦ":20,"ʨ":21,"ᵝ":22,"ꭧ":23,"A":24,"I":25,"O":31,"Q":33,"S":35,"T":36,"W":39,"Y":41,"ᵊ":42,"a":43,"b":44,"c":45,"d":46,"e":47,"f":48,"h":50,"i":51,"j":52,"k":53,"l":54,"m":55,"n":56,"o":57,"p":58,"q":59,"r":60,"s":61,"t":62,"u":63,"v":64,"w":65,"x":66,"y":67,"z":68,"ɑ":69,"ɐ":70,"ɒ":71,"æ":72,"β":75,"ɔ":76,"ɕ":77,"ç":78,"ɖ":80,"ð":81,"ʤ":82,"ə":83,"ɚ":85,"ɛ":86,"ɜ":87,"ɟ":90,"ɡ":92,"ɥ":99,"ɨ":101,"ɪ":102,"ʝ":103,"ɯ":110,"ɰ":111,"ŋ":112,"ɳ":113,"ɲ":114,"ɴ":115,"ø":116,"ɸ":118,"θ":119,"œ":120,"ɹ":123,"ɾ":125,"ɻ":126,"ʁ":128,"ɽ":129,"ʂ":130,"ʃ":131,"ʈ":132,"ʧ":133,"ʊ":135,"ʋ":136,"ʌ":138,"ɣ":139,"ɤ":140,"χ":142,"ʎ":143,"ʒ":147,"ʔ":148,"ˈ":156,"ˌ":157,"ː":158,"ʰ":162,"ʲ":164,"↓":169,"→":171,"↗":172,"↘":173,"ᵻ":177};

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
    this.lex = null; this.T = null; this.tts = null; this.voice = null; this.asr = null;
    this.device = null; this._q = Promise.resolve(); this._phon = null;
  }

  async loadDict(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("발음 사전을 불러오지 못했어요");
    this.lex = new Lexicon(await r.json());
  }

  // AI 모델 불러오기. onProgress(0~1, 설명)
  async loadModels(onProgress = () => {}) {
    const T = this.T = await import(TJS);
    T.env.allowLocalModels = false;
    const files = new Map();
    const cb = p => {
      if (!p.file) return;
      const k = (p.name || "") + "/" + p.file;
      const cur = files.get(k) || { loaded: 0, total: 0 };
      if (p.status === "progress") { cur.loaded = p.loaded; cur.total = p.total; }
      if (p.status === "done") { cur.loaded = cur.total = Math.max(cur.total, cur.loaded, 1); }
      files.set(k, cur);
      let l = 0, t = 0; for (const v of files.values()) { l += v.loaded; t += v.total; }
      onProgress(t ? l / t : 0, `${Math.round(l / 1e6)}MB / ${Math.round(t / 1e6)}MB`);
    };
    let gpu = false;
    try { gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch (e) { gpu = false; }
    try {
      this.tts = await T.StyleTextToSpeech2Model.from_pretrained(KOKORO, { dtype: "fp32", device: gpu ? "webgpu" : "wasm", progress_callback: cb });
      this.device = gpu ? "webgpu" : "wasm";
    } catch (e) {
      if (!gpu) throw e;
      this.tts = await T.StyleTextToSpeech2Model.from_pretrained(KOKORO, { dtype: "fp32", device: "wasm", progress_callback: cb });
      this.device = "wasm";
    }
    const vr = await fetch(`https://huggingface.co/${KOKORO}/resolve/main/voices/${VOICE}.bin`);
    if (!vr.ok) throw new Error("목소리 데이터를 불러오지 못했어요");
    this.voice = new Float32Array(await vr.arrayBuffer());
    this.asr = await T.pipeline("automatic-speech-recognition", ASR_MODEL, { dtype: "q8", device: "wasm", progress_callback: cb });
    onProgress(1, "준비 완료");
  }

  // 모델 호출은 한 번에 하나씩
  _run(fn) { const p = this._q.then(fn, fn); this._q = p.catch(() => {}); return p; }

  synth(ps, speed = 1) {
    return this._run(async () => {
      const T = this.T;
      const ids = [0, ...[...ps].map(c => VOCAB[c]).filter(v => v !== undefined), 0];
      const n = Math.min(Math.max(ids.length - 2, 1), 510);
      const out = await this.tts({
        input_ids: new T.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        style: new T.Tensor("float32", this.voice.slice((n - 1) * 256, n * 256), [1, 256]),
        speed: new T.Tensor("float32", [speed], [1]),
      });
      return new Float32Array(out.waveform.data);
    });
  }

  transcribe(a24) {
    return this._run(async () => (await this.asr(A.to16k(a24))).text.trim());
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

  // 단어 하나의 세 가지 빠르기 음성 만들기 (baseSpeed: '다시 만들기' 때 조금 다른 빠르기로)
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
