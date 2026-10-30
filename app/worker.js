// AI 모델 일꾼 (Web Worker): Kokoro 음성 만들기와 Whisper 받아적기를 화면과 따로 돌린다.
// 화면 쪽(engine.js)이 멈추지 않도록 무거운 계산은 모두 여기서 한다.
// 메시지: {id, type:"load", forceWasm} → {device} / {id, type:"synth", ps, speed} → {audio} / {id, type:"asr", audio} → {text}
// 진행 상황은 {type:"progress", p, txt} 로 알린다.

import { env, pipeline, StyleTextToSpeech2Model, Tensor } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";

const KOKORO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const ASR_MODEL = "onnx-community/whisper-base.en";
const VOICE = "af_heart";
const VOCAB = {";":1,":":2,",":3,".":4,"!":5,"?":6,"—":9,"…":10,"\"":11,"(":12,")":13,"“":14,"”":15," ":16,"̃":17,"ʣ":18,"ʥ":19,"ʦ":20,"ʨ":21,"ᵝ":22,"ꭧ":23,"A":24,"I":25,"O":31,"Q":33,"S":35,"T":36,"W":39,"Y":41,"ᵊ":42,"a":43,"b":44,"c":45,"d":46,"e":47,"f":48,"h":50,"i":51,"j":52,"k":53,"l":54,"m":55,"n":56,"o":57,"p":58,"q":59,"r":60,"s":61,"t":62,"u":63,"v":64,"w":65,"x":66,"y":67,"z":68,"ɑ":69,"ɐ":70,"ɒ":71,"æ":72,"β":75,"ɔ":76,"ɕ":77,"ç":78,"ɖ":80,"ð":81,"ʤ":82,"ə":83,"ɚ":85,"ɛ":86,"ɜ":87,"ɟ":90,"ɡ":92,"ɥ":99,"ɨ":101,"ɪ":102,"ʝ":103,"ɯ":110,"ɰ":111,"ŋ":112,"ɳ":113,"ɲ":114,"ɴ":115,"ø":116,"ɸ":118,"θ":119,"œ":120,"ɹ":123,"ɾ":125,"ɻ":126,"ʁ":128,"ɽ":129,"ʂ":130,"ʃ":131,"ʈ":132,"ʧ":133,"ʊ":135,"ʋ":136,"ʌ":138,"ɣ":139,"ɤ":140,"χ":142,"ʎ":143,"ʒ":147,"ʔ":148,"ˈ":156,"ˌ":157,"ː":158,"ʰ":162,"ʲ":164,"↓":169,"→":171,"↗":172,"↘":173,"ᵻ":177};

env.allowLocalModels = false;
let tts = null, voice = null, asr = null, device = null;

// 요청은 한 번에 하나씩 처리
const queue = [];
let running = false;
self.onmessage = e => { queue.push(e.data); pump(); };

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const m = queue.shift();
    try {
      const { msg, transfer } = await handle(m);
      self.postMessage({ id: m.id, ok: true, ...msg }, transfer || []);
    } catch (err) {
      self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
    }
  }
  running = false;
}

async function handle(m) {
  if (m.type === "load") return { msg: { device: await load(m.forceWasm) } };
  if (m.type === "synth") {
    const ids = [0, ...[...m.ps].map(c => VOCAB[c]).filter(v => v !== undefined), 0];
    const n = Math.min(Math.max(ids.length - 2, 1), 510);
    const out = await tts({
      input_ids: new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      style: new Tensor("float32", voice.slice((n - 1) * 256, n * 256), [1, 256]),
      speed: new Tensor("float32", [m.speed || 1], [1]),
    });
    const audio = new Float32Array(out.waveform.data);
    return { msg: { audio }, transfer: [audio.buffer] };
  }
  if (m.type === "asr") {
    const r = await asr(m.audio);
    return { msg: { text: (r.text || "").trim() } };
  }
  throw new Error("알 수 없는 요청: " + m.type);
}

async function load(forceWasm) {
  if (tts && asr) return device;
  const files = new Map();
  const cb = p => {
    if (!p.file) return;
    const k = (p.name || "") + "/" + p.file;
    const cur = files.get(k) || { loaded: 0, total: 0 };
    if (p.status === "progress") { cur.loaded = p.loaded; cur.total = p.total; }
    if (p.status === "done") { cur.loaded = cur.total = Math.max(cur.total, cur.loaded, 1); }
    files.set(k, cur);
    let l = 0, t = 0; for (const v of files.values()) { l += v.loaded; t += v.total; }
    self.postMessage({ type: "progress", p: t ? l / t : 0, txt: `${Math.round(l / 1e6)}MB / ${Math.round(t / 1e6)}MB` });
  };
  let gpu = false;
  if (!forceWasm) { try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch (e) { gpu = false; } }
  try {
    tts = await StyleTextToSpeech2Model.from_pretrained(KOKORO, { dtype: "fp32", device: gpu ? "webgpu" : "wasm", progress_callback: cb });
    device = gpu ? "webgpu" : "wasm";
  } catch (e) {
    if (!gpu) throw e;
    tts = await StyleTextToSpeech2Model.from_pretrained(KOKORO, { dtype: "fp32", device: "wasm", progress_callback: cb });
    device = "wasm";
  }
  const vr = await fetch(`https://huggingface.co/${KOKORO}/resolve/main/voices/${VOICE}.bin`);
  if (!vr.ok) throw new Error("목소리 데이터를 불러오지 못했어요");
  voice = new Float32Array(await vr.arrayBuffer());
  asr = await pipeline("automatic-speech-recognition", ASR_MODEL, { dtype: "q8", device: "wasm", progress_callback: cb });
  return device;
}
