// 단어장 정리본 (비공개 저장소 Words-Books) 에서 시험 범위의 단어·뜻 꺼내기
// books/index.json : { classes: { 반코드: [단어장 id, ...] (앞이 지금 쓰는 단어장) }, books: { id: { book, sections, words } } }
// books/<id>.json  : { id, book, sections: [{ name, items: [{ no, w, m, pos? }] }] }
// 범위 글자 규칙은 wordbook/wordrange.py 와 같다: "4회 11~20번", "unit.5", "Unit 30 1-5", "Day 6 1~5번", "Day 7~8", "1~2회"

export const BOOKS_REPO = "Words-Books";

export class Books {
  constructor(gh) { this.gh = gh.other(BOOKS_REPO); this.cache = new Map(); this.idx = null; }
  async index(fresh = false) {
    if (this.idx && !fresh) return this.idx;
    const t = await this.gh.getText("books/index.json");
    if (!t) throw new Error("Words-Books 저장소의 books/index.json 을 읽지 못했어요 (열쇠에 저장소가 없거나 파일이 없음)");
    this.idx = JSON.parse(t);
    this.idx.classes = this.idx.classes || {}; this.idx.books = this.idx.books || {};
    return this.idx;
  }
  async book(id) {
    if (!this.cache.has(id)) {
      const p = this.gh.getText(`books/${id}.json`).then(t => { if (!t) throw new Error("단어장 파일이 없어요: " + id); return JSON.parse(t); });
      this.cache.set(id, p);
      p.catch(() => this.cache.delete(id));
    }
    return this.cache.get(id);
  }
  // ---- 준비해 둔 단어장 (2026-11-03): drafts/index.json = { drafts: [{ id, cls, date, title, n, saved }] }, drafts/<id>.json = { id, cls, date, title, words: [{ w, m, a }], fixes, saved }
  async drafts() {
    const t = await this.gh.getText("drafts/index.json");
    const j = t ? JSON.parse(t) : { drafts: [] };
    return Array.isArray(j.drafts) ? j.drafts : [];
  }
  async getDraft(id) {
    const t = await this.gh.getText(`drafts/${id}.json`);
    if (!t) throw new Error("준비해 둔 단어장 파일을 찾지 못했어요. 새로고침해 주세요.");
    return JSON.parse(t);
  }
  async saveDraft(d, message) {
    const list = (await this.drafts()).filter(x => x.id !== d.id);
    list.push({ id: d.id, cls: d.cls, date: d.date, title: d.title, n: d.words.length, saved: d.saved });
    list.sort((a, b) => a.date.localeCompare(b.date) || a.saved.localeCompare(b.saved));
    await this.gh.commit({ "drafts/index.json": JSON.stringify({ drafts: list }, null, 1) + "\n", [`drafts/${d.id}.json`]: JSON.stringify(d) + "\n" }, message);
    return list;
  }
  async deleteDraft(id, message) {
    const list = (await this.drafts()).filter(x => x.id !== id);
    await this.gh.commit({ "drafts/index.json": JSON.stringify({ drafts: list }, null, 1) + "\n", [`drafts/${id}.json`]: null }, message);
    return list;
  }

  // 반에 쓰는 단어장 정하기 (id 가 없으면 연결 끊기). 다른 사람이 바꾼 것과 겹치지 않게 새로 읽어서 고친다.
  async setClassBook(code, id, message) {
    const idx = await this.index(true);
    const old = idx.classes[code] || [];
    if (id) idx.classes[code] = [id, ...old.filter(x => x !== id)];
    else delete idx.classes[code];
    await this.gh.commit({ "books/index.json": JSON.stringify(idx, null, 1) + "\n" }, message);
    this.idx = idx;
    return idx;
  }
}

const KIND = { "회": "회", "과": "lesson", "쪽": "쪽", unit: "unit", u: "unit", lesson: "lesson", l: "lesson", day: "day", chapter: "chapter", ch: "chapter", part: "part", page: "쪽", p: "쪽" };
const EN_KIND = /(?<![a-z])(unit|lesson|day|chapter|ch|part|page|u|l|p)\s*(\d+)/;
const KO_KIND = /(\d+)\s*(회|과|쪽)/;

// 구역 이름 → [종류, 번호]  ("UNIT 05" → ["unit", 5], "Unit 4. Lisa's Sandwich" → ["unit", 4], "3회" → ["회", 3])
export function secKey(name) {
  const n = String(name).toLowerCase().replace(/\./g, " ");
  let m = EN_KIND.exec(n);
  if (m) return [KIND[m[1]], +m[2]];
  m = KO_KIND.exec(n);
  if (m) return [KIND[m[2]], +m[1]];
  return null;
}
const shortName = name => String(name).split(".")[0].trim();
const prefixOf = book => { const m = /^([^\d]*?)\s*\d/.exec(book.sections[0] ? book.sections[0].name : ""); return m ? m[1].trim() : ""; };

// "있는 범위" 와 적는 예
export function rangeHint(book) {
  const s = book.sections; if (!s.length) return { have: "", examples: [] };
  const have = `${shortName(s[0].name)} ~ ${shortName(s[s.length - 1].name)}`;
  const k = secKey(s[0].name), ex = s[Math.min(4, s.length - 1)], ek = secKey(ex.name);
  const label = ek ? (["회", "쪽"].includes(ek[0]) ? `${ek[1]}${ek[0]}` : `${prefixOf(book) || ek[0]} ${ek[1]}`) : shortName(ex.name);
  const examples = [label, `${label} 1~10번`];
  if (k && k[0] === "day" && ek) examples.push(`${label}~${ek[1] + 1}`);
  return { have, examples };
}

// 범위 글자 → { items: [{ from, no, word, meaning, pos }] } 또는 { error }
export function resolveRange(book, q) {
  const keys = new Map();
  for (const s of book.sections) { const k = secKey(s.name); if (k) keys.set(k.join(":"), s); }
  const q0 = String(q).toLowerCase().replace(/\./g, " ").replace(/[–—-]/g, "~").replace(/\s+/g, " ").trim();
  const pat = /(?:(?<![a-z])(unit|lesson|day|chapter|ch|part|page|u|l|p)\s*(\d+)(?:\s*~\s*(\d+))?|(\d+)(?:\s*~\s*(\d+))?\s*(회|과|쪽))(?:\s*[,:]?\s*(\d+)\s*~\s*(\d+)\s*번?|\s*[,:]?\s*(\d+)\s*번|\s+(\d+)(?!\s*(?:회|과|쪽|~|\d)))?/g;
  const found = [];
  let m;
  while ((m = pat.exec(q0))) {
    let kind, a, b;
    if (m[1]) { kind = KIND[m[1]]; a = +m[2]; b = +(m[3] || m[2]); }
    else { kind = KIND[m[6]]; a = +m[4]; b = +(m[5] || m[4]); }
    let lo = null, hi = null;
    if (m[7]) { lo = +m[7]; hi = +m[8]; } else if (m[9] || m[10]) { lo = hi = +(m[9] || m[10]); }
    if (b < a) [a, b] = [b, a];
    if (lo != null && hi < lo) [lo, hi] = [hi, lo];
    if (b - a > 30) return { error: "범위가 너무 넓어요. 한 번에 몇 개 구역만 적어 주세요." };
    for (let n = a; n <= b; n++) {
      const s = keys.get(`${kind}:${n}`);
      const label = ["회", "쪽"].includes(kind) ? `${n}${kind}` : `${prefixOf(book) || kind} ${n}`;
      if (!s) return { error: `이 단어장에는 ‘${label}’ 범위가 없어요. 있는 범위: ${rangeHint(book).have}` };
      let its = s.items;
      if (lo != null) {
        // 번호가 그 구역 안의 번호와 맞으면 그 번호로, 아니면 구역 안에서 몇 번째인지로 (Day 6 = 101~120번인 단어장)
        its = s.items.filter(i => typeof i.no === "number" && i.no >= lo && i.no <= hi);
        if (!its.length) its = s.items.slice(lo - 1, hi);
        if (!its.length) return { error: `${shortName(s.name)}에는 ${lo === hi ? lo : `${lo}~${hi}`}번이 없어요. 단어가 ${s.items.length}개 있어요.` };
      }
      for (const i of its) found.push({ from: s.name, no: i.no, word: i.w, meaning: i.m, pos: i.pos || [] });
    }
  }
  if (!found.length) {
    const ex = rangeHint(book).examples;
    return { error: `범위를 알아보지 못했어요. 예: ${ex.slice(0, 2).join(", ")}` };
  }
  return { items: found };
}
