// 영어 단어 → Kokoro 발음 기호 (misaki 미국식 사전, Python 버전 wordvoice.phonemes_for 와 같은 규칙)
// 뜻에 따라 발음이 달라지는 단어는 후보와 한국어 뜻으로 추측한 기본 선택을 함께 돌려준다.

const STRESSES = "ˌˈ", PRIMARY = "ˈ", SECONDARY = "ˌ";
const VOWELS = new Set("AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ");
const US_TAUS = new Set("AIOWYiuæɑəɛɪɹʊʌ");

function applyStress(ps, stress) {
  const restress = p => {
    const ips = [...p].map((c, i) => [i, c]);
    const moves = {};
    ips.forEach(([i, c]) => {
      if (STRESSES.includes(c)) {
        for (let j = i; j < ips.length; j++) if (VOWELS.has(ips[j][1])) { moves[i] = j - 0.5; break; }
      }
    });
    for (const [i, j] of Object.entries(moves)) ips[i] = [j, ips[i][1]];
    return ips.sort((a, b) => a[0] - b[0]).map(x => x[1]).join("");
  };
  const has = s => ps.includes(s), noStress = ![...STRESSES].some(has), noVowel = ![...ps].some(c => VOWELS.has(c));
  if (stress == null) return ps;
  if (stress < -1) return ps.replaceAll(PRIMARY, "").replaceAll(SECONDARY, "");
  if (stress === -1 || ((stress === 0 || stress === -0.5) && has(PRIMARY))) return ps.replaceAll(SECONDARY, "").replaceAll(PRIMARY, SECONDARY);
  if ([0, 0.5, 1].includes(stress) && noStress) return noVowel ? ps : restress(SECONDARY + ps);
  if (stress >= 1 && !has(PRIMARY) && has(SECONDARY)) return ps.replaceAll(SECONDARY, PRIMARY);
  if (stress > 1 && noStress) return noVowel ? ps : restress(PRIMARY + ps);
  return ps;
}

function parentTag(tag) {
  if (!tag) return tag;
  if (tag.startsWith("VB")) return "VERB";
  if (tag.startsWith("NN")) return "NOUN";
  if (tag.startsWith("ADV") || tag.startsWith("RB")) return "ADV";
  if (tag.startsWith("ADJ") || tag.startsWith("JJ")) return "ADJ";
  return tag;
}

const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;

export class Lexicon {
  constructor(dict) { this.g = dict.g; this.s = dict.s; }

  // grow_dictionary 와 같은 효과: 소문자 단어는 대문자 시작형으로, 대문자 시작형은 소문자로도 찾는다.
  entry(word) {
    for (const d of [this.g, this.s]) {
      if (word in d) return d[word];
      if (word.length >= 2) {
        if (word === word.toLowerCase() && word !== cap(word) && cap(word) in d) return d[cap(word)];
        if (word === cap(word) && word.toLowerCase() in d) return d[word.toLowerCase()];
      }
    }
    return undefined;
  }
  known(word) { return this.entry(word) !== undefined; }

  lookup(word, tag, stress) {
    let ps = this.entry(word);
    if (ps && typeof ps === "object") {
      let t = tag;
      if ("None" in ps) t = "None"; // 뒤에 단어가 없을 때의 발음 (Python: ctx.future_vowel is None)
      else if (!(t in ps)) t = parentTag(t);
      ps = (t in ps) ? ps[t] : ps.DEFAULT;
    }
    return ps == null ? null : applyStress(ps, stress);
  }

  _s(st) { if (!st) return null; const c = st.at(-1); if ("ptkfθ".includes(c)) return st + "s"; if ("szʃʒʧʤ".includes(c)) return st + "ᵻz"; return st + "z"; }
  stemS(w, tag, stress) {
    if (w.length < 3 || !w.endsWith("s")) return null;
    let st;
    if (!w.endsWith("ss") && this.known(w.slice(0, -1))) st = w.slice(0, -1);
    else if ((w.endsWith("'s") || (w.length > 4 && w.endsWith("es") && !w.endsWith("ies"))) && this.known(w.slice(0, -2))) st = w.slice(0, -2);
    else if (w.length > 4 && w.endsWith("ies") && this.known(w.slice(0, -3) + "y")) st = w.slice(0, -3) + "y";
    else return null;
    return this._s(this.lookup(st, tag, stress));
  }
  _ed(st) {
    if (!st) return null; const c = st.at(-1);
    if ("pkfθʃsʧ".includes(c)) return st + "t";
    if (c === "d") return st + "ᵻd";
    if (c !== "t") return st + "d";
    if (st.length < 2) return st + "ɪd";
    if (US_TAUS.has(st.at(-2))) return st.slice(0, -1) + "ɾᵻd";
    return st + "ᵻd";
  }
  stemEd(w, tag, stress) {
    if (w.length < 4 || !w.endsWith("d")) return null;
    let st;
    if (!w.endsWith("dd") && this.known(w.slice(0, -1))) st = w.slice(0, -1);
    else if (w.length > 4 && w.endsWith("ed") && !w.endsWith("eed") && this.known(w.slice(0, -2))) st = w.slice(0, -2);
    else return null;
    return this._ed(this.lookup(st, tag, stress));
  }
  _ing(st) {
    if (!st) return null;
    if (st.length > 1 && st.at(-1) === "t" && US_TAUS.has(st.at(-2))) return st.slice(0, -1) + "ɾɪŋ";
    return st + "ɪŋ";
  }
  stemIng(w, tag, stress) {
    if (w.length < 5 || !w.endsWith("ing")) return null;
    let st;
    if (w.length > 5 && this.known(w.slice(0, -3))) st = w.slice(0, -3);
    else if (this.known(w.slice(0, -3) + "e")) st = w.slice(0, -3) + "e";
    else if (w.length > 5 && /([bcdgklmnprstvxz])\1ing$|cking$/.test(w) && this.known(w.slice(0, -4))) st = w.slice(0, -4);
    else return null;
    return this._ing(this.lookup(st, tag, stress));
  }

  // 한 단어의 발음 (모르면 null)
  word(w, tag = null) {
    if (w === "a" || w === "A") return "ˈA";
    let word = w;
    const wl = w.toLowerCase();
    if (w.length > 1 && w !== wl && !this.known(w) && (w === w.toUpperCase() || w.slice(1) === w.slice(1).toLowerCase())
        && (this.known(wl) || this.stemS(wl, tag, null) || this.stemEd(wl, tag, null) || this.stemIng(wl, tag, 0.5))) word = wl;
    if (this.known(word)) return this.lookup(word, tag, null);
    if (word.endsWith("s'") && this.known(word.slice(0, -2) + "'s")) return this.lookup(word.slice(0, -2) + "'s", tag, null);
    if (word.endsWith("'") && this.known(word.slice(0, -1))) return this.lookup(word.slice(0, -1), tag, null);
    return this.stemS(word, tag, null) || this.stemEd(word, tag, null) || this.stemIng(word, tag, 0.5) || null;
  }

  // 단어/구 전체의 발음. 모르는 부분이 있으면 null 과 그 부분을 돌려준다.
  phrase(text, tag = null) {
    const toks = text.match(/[A-Za-z']+/g) || [];
    const parts = [], missing = [];
    toks.forEach((t, i) => {
      let ps;
      if (toks.length > 1) {
        const lw = t.toLowerCase();
        if (lw === "a") ps = "ɐ";
        else if (lw === "an") ps = "ɐn";
      }
      ps = ps || this.word(t, toks.length === 1 ? tag : null);
      if (ps == null) missing.push(t); else parts.push(ps);
    });
    if (!toks.length || missing.length) return { ps: null, missing };
    return { ps: parts.join(" "), missing: [] };
  }

  // 뜻에 따라 발음이 달라지는 단어의 후보
  variants(text) {
    const toks = text.match(/[A-Za-z']+/g) || [];
    if (toks.length !== 1) return null;
    const key = toks[0];
    const extra = EXTRA[key.toLowerCase()];
    if (extra) return extra.map(e => ({ ps: e.ps, tags: [], label: e.label, keys: e.keys }));
    let e = this.entry(key);
    if (e === undefined) e = this.entry(key.toLowerCase());
    if (!e || typeof e !== "object") return null;
    const byPs = new Map();
    for (const [tag, ps] of Object.entries(e)) {
      if (!ps || tag === "None" || tag === "DT") continue;
      if (!byPs.has(ps)) byPs.set(ps, []);
      byPs.get(ps).push(tag);
    }
    if (byPs.size < 2) return null;
    return [...byPs.entries()].map(([ps, tags]) => ({ ps, tags, label: tagLabel(tags) }));
  }
}

// VBP(현재형)는 사전 자료가 고르지 않아(read 의 VBP 가 과거 발음) 이름과 추측에 쓰지 않는다.
const TAG_KO = { VBD: "과거형", VBN: "과거분사", VERB: "동사", ADJ: "형용사", NOUN: "명사", ADV: "부사", DEFAULT: "기본" };
const TAG_ORDER = ["VBD", "VBN", "VERB", "ADJ", "ADV", "NOUN", "DEFAULT"];
function tagLabel(tags) {
  const sorted = TAG_ORDER.filter(t => tags.includes(t));
  const names = [...new Set(sorted.map(t => TAG_KO[t]))];
  if (names.length > 2) names.length = 2;
  return names.join("·");
}

// 사전에는 한 가지 발음뿐이지만 뜻에 따라 발음이 달라지는 단어
const EXTRA = {
  lead: [{ ps: "lˈid", label: "이끌다", keys: ["이끌", "안내", "인도", "앞장", "선두", "통하"] }, { ps: "lˈɛd", label: "납", keys: ["납", "연필심"] }],
  bass: [{ ps: "bˈAs", label: "베이스(낮은 음)", keys: ["베이스", "저음", "낮은"] }, { ps: "bˈæs", label: "농어", keys: ["농어", "물고기"] }],
  dove: [{ ps: "dˈʌv", label: "비둘기", keys: ["비둘기"] }, { ps: "dˈOv", label: "dive의 과거", keys: ["뛰어들", "잠수", "다이빙"] }],
  does: [{ ps: "dˈʌz", label: "하다(does)", keys: ["하다", "한다"] }, { ps: "dˈOz", label: "암사슴들", keys: ["사슴"] }],
  row: [{ ps: "ɹˈO", label: "줄·노 젓다", keys: ["줄", "열", "노", "젓"] }, { ps: "ɹˈW", label: "말다툼", keys: ["다툼", "싸움", "말싸움"] }],
  sow: [{ ps: "sˈO", label: "씨 뿌리다", keys: ["씨", "뿌리"] }, { ps: "sˈW", label: "암퇘지", keys: ["돼지"] }],
  wound: [{ ps: "wˈund", label: "상처", keys: ["상처", "부상", "다치"] }, { ps: "wˈWnd", label: "wind(감다)의 과거", keys: ["감았", "감은"] }],
  house: [{ ps: "hˈWs", label: "집", keys: ["집", "주택"] }, { ps: "hˈWz", label: "수용하다", keys: ["수용", "살게 하", "보관"] }],
  excuse: [{ ps: "ɪkskjˈus", label: "변명", keys: ["변명", "핑계", "구실"] }, { ps: "ɪkskjˈuz", label: "용서하다", keys: ["용서", "봐주", "실례"] }],
  lives: [{ ps: "lˈIvz", label: "삶·목숨들", keys: ["삶", "목숨", "생명"] }, { ps: "lˈɪvz", label: "살다", keys: ["살다", "산다", "살고"] }],
  tears: [{ ps: "tˈɪɹz", label: "눈물", keys: ["눈물"] }, { ps: "tˈɛɹz", label: "찢다", keys: ["찢"] }],
  winds: [{ ps: "wˈɪndz", label: "바람", keys: ["바람"] }, { ps: "wˈIndz", label: "감다", keys: ["감다", "감는", "구불"] }],
};

// 한국어 뜻으로 어떤 발음인지 추측한다 (선생님이 바꿀 수 있음).
export function guessVariant(variants, meaning) {
  const m = (meaning || "").trim();
  if (!variants || !variants.length) return 0;
  if (variants[0].keys) {
    const i = variants.findIndex(v => v.keys.some(k => m.includes(k)));
    return i < 0 ? 0 : i;
  }
  const first = m.split(/[,;/·]| 또는 /)[0].replace(/\(.*?\)/g, "").trim();
  let tag;
  if (/(었|았|였|했|렸|웠|졌|쳤|왔|갔|났|섰|켰|봤|줬|썼|냈|됐)다$/.test(first) || /했다|과거/.test(m)) tag = "VBD";
  else if (/다$/.test(first)) tag = "VERB";
  else if (/(한|운|은|는|인|적인|ㄴ|던|스러운|로운|같은|있는|없는)$/.test(first)) tag = "ADJ";
  else tag = "NOUN";
  const order = { VBD: ["VBD", "VBN"], VERB: ["VERB"], ADJ: ["ADJ"], NOUN: ["NOUN"] }[tag];
  for (const t of order) { const i = variants.findIndex(v => v.tags.includes(t)); if (i >= 0) return i; }
  const d = variants.findIndex(v => v.tags.includes("DEFAULT"));
  return d < 0 ? 0 : d;
}

// 읽기 쉬운 발음 기호로 (화면 표시용)
export function displayIpa(ps) {
  return "/" + ps.replace(/([ˈˌ])i(?!ə)/g, "$1iː").replace(/([ˈˌ])u/g, "$1uː").replace(/[ˈˌ]/g, "")
    .replaceAll("A", "eɪ").replaceAll("I", "aɪ").replaceAll("O", "oʊ").replaceAll("W", "aʊ").replaceAll("Y", "ɔɪ")
    .replaceAll("ᵊ", "ə").replaceAll("ᵻ", "ɪ").replaceAll("ɾ", "t").replaceAll("ɹ", "r")
    .replaceAll("ʤ", "dʒ").replaceAll("ʧ", "tʃ") + "/";
}

// espeak(IPA) → Kokoro 발음 기호 (사전에 없는 단어용, misaki EspeakFallback 과 같은 변환)
export function espeakToKokoro(ipa) {
  let ps = ipa.trim();
  const E2M = [["ʔˌn̩", "ʔn"], ["ʔn̩", "ʔn"], ["aɪ", "I"], ["aʊ", "W"], ["dʒ", "ʤ"], ["eɪ", "A"], ["tʃ", "ʧ"], ["ɔɪ", "Y"],
    ["ʲo", "jo"], ["ʲə", "jə"], ["ʲ", ""], ["ɚ", "əɹ"], ["oʊ", "O"], ["e", "A"], ["r", "ɹ"], ["x", "k"], ["ç", "k"], ["ɐ", "ə"], ["ɬ", "l"], ["̃", ""]];
  for (const [a, b] of E2M) ps = ps.replaceAll(a, b);
  ps = ps.replace(/(\S)̩/g, "ᵊ$1").replaceAll("̩", "");
  ps = ps.replaceAll("ɜːɹ", "ɜɹ").replaceAll("ɜː", "ɜɹ").replaceAll("ɪə", "iə").replaceAll("ː", "").replaceAll("o", "ɔ");
  return ps;
}

// 음성인식 결과와 의도한 발음이 같은 소리인지 비교할 때 쓰는 정규화
export function soundKey(ps) {
  return ps.replace(/[ˈˌ\s]/g, "").replaceAll("ᵊ", "ə").replaceAll("ɾ", "t").replaceAll("ᵻ", "ɪ").replaceAll("ʔ", "t");
}
