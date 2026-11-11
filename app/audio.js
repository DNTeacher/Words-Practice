// 단어장 음성 처리: 앞뒤 무음 정리, 음량 맞추기, 음높이를 유지한 채 느리게 하기(WSOLA), WAV/MP3 변환.
// Python 버전(wordvoice.py)의 trim_and_pad / normalize / stretch 와 같은 동작을 하도록 맞춤.

export const SR = 24000;

function maxAbs(a) { let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m; }

// 앞뒤 무음을 정리하고 짧은 여백을 붙인다 (휴대폰에서 첫소리가 잘리지 않게).
export function trimAndPad(a, { lead = 0.12, tail = 0.15, threshDb = -55 } = {}) {
  const w = 240, env = new Float32Array(a.length);
  let acc = 0;
  for (let i = 0; i < a.length + w / 2; i++) {
    if (i < a.length) acc += Math.abs(a[i]);
    if (i - w >= 0) acc -= Math.abs(a[i - w]);
    const c = i - w / 2;
    if (c >= 0 && c < a.length) env[c] = acc / w;
  }
  const thr = Math.pow(10, threshDb / 20) * Math.max(maxAbs(env), 1e-6);
  let s = 0, e = a.length - 1;
  while (s < a.length && env[s] <= thr) s++;
  while (e > s && env[e] <= thr) e--;
  let b;
  if (s < a.length) {
    const s0 = Math.max(0, s - Math.round(0.06 * SR)), e0 = Math.min(a.length, e + Math.round(0.08 * SR));
    b = a.slice(s0, e0);
  } else b = a.slice();
  const fade = Math.round(0.008 * SR);
  if (b.length > 2 * fade) {
    for (let i = 0; i < fade; i++) { const g = i / (fade - 1); b[i] *= g; b[b.length - 1 - i] *= g; }
  }
  const out = new Float32Array(Math.round(lead * SR) + b.length + Math.round(tail * SR));
  out.set(b, Math.round(lead * SR));
  return out;
}

// 단어마다 소리 크기가 비슷하도록 맞춘다 (피크 제한 포함).
export function normalize(a, { peakDb = -1.5, targetRmsDb = -18 } = {}) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (Math.abs(v) > 1e-4) { sum += v * v; n++; } }
  const rms = n ? Math.sqrt(sum / n) : 1e-4;
  let g = Math.pow(10, targetRmsDb / 20) / Math.max(rms, 1e-6);
  const peak = maxAbs(a) * g, lim = Math.pow(10, peakDb / 20);
  if (peak > lim) g *= lim / peak;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * g;
  return out;
}

export function finish(a) { return normalize(trimAndPad(a)); }

// ---------- s + p/t/k 로 시작하는 단어 (spice, space, sky, street) ----------
// AI 음성은 첫 s 에 목소리를 섞어 "이스바이스(It's bice)"처럼 들리게 한다 (2026-11-11, spice).
// s 소리(첫 소리 ~ p/t/k 를 막는 조용한 틈)에서 낮은 소리만 걸러 내면 깨끗한 s 가 된다.
// 시험: 16단어 음성인식(Parakeet·Whisper) 맞음 17/32 → 30/32, 나빠진 단어 없음. wordvoice.py 의 clear_s_onset 과 같은 계산.
export const S_ONSET = /^[ˈˌ]?s[ptk]/;
const HP_Q = [0.5176381, 0.7071068, 1.9318517]; // 6차 버터워스
function highpass(x, fc, sr) {
  let y = Float32Array.from(x);
  const w0 = 2 * Math.PI * fc / sr, cs = Math.cos(w0), sn = Math.sin(w0);
  const run = (q, rev) => {
    const al = sn / (2 * q), a0 = 1 + al;
    const b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, b2 = b0, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const n = y.length;
    for (let k = 0; k < n; k++) {
      const i = rev ? n - 1 - k : k, v = y[i];
      const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
    }
  };
  for (const q of HP_Q) run(q, false);   // 앞으로 한 번
  for (const q of HP_Q) run(q, true);    // 뒤로 한 번 (소리 위치가 밀리지 않게)
  return y;
}
export function clearSOnset(a, { sr = SR, cut = 2500 } = {}) {
  const hop = Math.round(sr * 0.005), nf = Math.floor((a.length - hop) / hop);
  if (nf < 20) return a;
  const db = new Float32Array(nf);
  let mx = -1e9;
  for (let f = 0; f < nf; f++) {
    let s = 0; for (let i = f * hop; i < f * hop + hop; i++) s += a[i] * a[i];
    db[f] = 20 * Math.log10(Math.sqrt(s / hop) + 1e-9); if (db[f] > mx) mx = db[f];
  }
  let start = 0; while (start < nf && !(db[start] > mx - 40)) start++;
  const lo = start + 6, hi = Math.min(start + 50, nf);
  if (lo >= hi) return a;
  let gap = lo, peak = -1e9;
  for (let f = lo; f < hi; f++) if (db[f] < db[gap]) gap = f;
  for (let f = start; f < gap; f++) if (db[f] > peak) peak = db[f];
  if (!(db[gap] < peak - 10)) return a;   // p/t/k 앞의 조용한 틈이 뚜렷하지 않으면 그대로 둔다
  const sEnd = gap * hop, xf = 2 * hop;
  const h = highpass(a.subarray(0, Math.min(a.length, sEnd + xf)), cut, sr);
  const out = Float32Array.from(a);
  out.set(h.subarray(0, sEnd), 0);
  for (let i = 0; i < xf && sEnd + i < h.length; i++) { const g = 1 - i / xf; out[sEnd + i] = h[sEnd + i] * g + a[sEnd + i] * (1 - g); }
  return out;
}

// WSOLA: 음높이는 그대로, 빠르기만 tempo 배로 (tempo < 1 이면 느려짐).
// win: 창 길이(초), search: 맞춤 탐색 범위(초).
export function stretch(x, tempo, { win = 0.03, search = 0.012 } = {}) {
  if (Math.abs(tempo - 1) < 1e-3) return x.slice();
  const N = Math.round(win * SR) & ~1, Hs = N >> 1, Ha = Hs * tempo, D = Math.round(search * SR);
  const outLen = Math.ceil(x.length / tempo) + N;
  const y = new Float32Array(outLen), wsum = new Float32Array(outLen);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const pad = new Float32Array(x.length + 2 * (N + D));
  pad.set(x, N + D);
  const at = i => pad[i + N + D];
  let prev = 0, k = 0;
  for (;; k++) {
    const nominal = Math.round(k * Ha);
    if (nominal >= x.length) break;
    let best = nominal;
    if (k > 0) {
      const tgt = prev + Hs; // 이전 조각이 자연스럽게 이어질 위치
      let bestScore = -Infinity;
      for (let d = -D; d <= D; d++) {
        const c = nominal + d;
        let s = 0;
        for (let i = 0; i < Hs; i++) s += at(c + i) * at(tgt + i);
        if (s > bestScore) { bestScore = s; best = c; }
      }
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      if (o + i >= outLen) break;
      y[o + i] += at(best + i) * hann[i];
      wsum[o + i] += hann[i];
    }
    prev = best;
  }
  const len = Math.min(outLen, Math.round(x.length / tempo));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = wsum[i] > 1e-3 ? y[i] / wsum[i] : 0;
  return out;
}

// 느린 음성 후보 (앞쪽이 기본). 음성인식 검증에서 처음 통과한 것을 쓴다.
export const SLOW_METHODS = [
  { id: "wsola30", make: (base, t) => stretch(base, t, { win: 0.03, search: 0.012 }) },
  { id: "wsola20", make: (base, t) => stretch(base, t, { win: 0.02, search: 0.008 }) },
  { id: "wsola45", make: (base, t) => stretch(base, t, { win: 0.045, search: 0.015 }) },
];

// 24kHz → 16kHz (음성인식용). 간단한 저역통과 + 선형 보간.
export function to16k(a) {
  const ratio = SR / 16000, n = Math.floor(a.length / ratio), out = new Float32Array(n);
  // 3탭 저역통과 후 보간 (단어 인식에는 충분)
  const f = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) f[i] = 0.25 * (a[i - 1] || 0) + 0.5 * a[i] + 0.25 * (a[i + 1] || 0);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, j = Math.floor(p), t = p - j;
    out[i] = f[j] * (1 - t) + (f[j + 1] || 0) * t;
  }
  return out;
}

export function concatWithGaps(clips, gapSec = 0.8) {
  const gap = Math.round(gapSec * SR);
  const len = clips.reduce((s, c) => s + c.length + gap, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const c of clips) { out.set(c, o); o += c.length + gap; }
  return out;
}

export function toInt16(a) {
  const out = new Int16Array(a.length);
  for (let i = 0; i < a.length; i++) { const v = Math.max(-1, Math.min(1, a[i])); out[i] = v < 0 ? v * 32768 : v * 32767; }
  return out;
}

export function wavBytes(a, sr = SR) {
  const pcm = toInt16(a), buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

// MP3 (48kbps, 24kHz 모노). lamejs 전역 객체가 필요하다.
export function mp3Bytes(a, lame) {
  const enc = new lame.Mp3Encoder(1, SR, 48);
  const pcm = toInt16(a), chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) chunks.push(b);
  }
  const end = enc.flush(); if (end.length) chunks.push(end);
  const len = chunks.reduce((s, c) => s + c.length, 0), out = new Uint8Array(len);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
