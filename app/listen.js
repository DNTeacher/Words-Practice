// 누가 들었나요? (2026-11-13)
// 학생 단어장 페이지가 '끝까지 들은 단어'를 선생님 구글 시트(구글 Apps Script 웹 앱)로 보내고,
// 선생님 앱이 그 기록을 열쇠(KEY)로 읽어 반별 표로 보여 준다.
//
// 파일 (반 이름·학생 이름)
//   Words-Books/students.json  (비공개) { classes: { e3b: [{ ko: "황채원", en: "Luna" }, …] } }
//   Words-Books/listen.json    (비공개) { url, key, saved }   ← 기록을 읽는 열쇠는 여기에만
//   Words-Practice/listen.json (공개)   { url, classes: { e3b: ["Leo", "Sun", "Luna"] } }  ← 학생 페이지가 읽음, 영어 이름만
// 기록이 쌓이는 곳: 선생님 구글 시트의 '듣기 기록' 탭 (반·학생·단어장마다 한 줄)

export const STUDENTS = "students.json", PRIVATE_CFG = "listen.json", PUBLIC_CFG = "listen.json";
export const SCRIPT_VERSION = 1;
const WEBAPP_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

export function newKey() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, x => abc[x % abc.length]).join("");
}
export const cleanUrl = s => String(s || "").trim().replace(/\?.*$/, "");
export const isWebAppUrl = s => WEBAPP_RE.test(cleanUrl(s));

// 구글 시트에 붙여 넣을 스크립트 (열쇠가 들어간 채로 복사된다)
export function appsScript(key) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(key)) throw new Error("열쇠 모양이 이상해요");
  return SCRIPT.replace("__KEY__", key);
}
const SCRIPT = String.raw`// 들어Voca 듣기 기록 (v${SCRIPT_VERSION}) — 학생 단어장 페이지가 보내는 '들은 단어' 기록을 이 시트의 '듣기 기록' 탭에 저장해요.
// KEY 는 선생님 앱만 기록을 읽을 수 있게 하는 비밀 글자예요. 다른 사람에게 보여 주지 마세요.
const KEY = "__KEY__";
const SHEET = "듣기 기록";
const HEAD = ["반", "학생", "단어장 파일", "단어장 제목", "숙제 날짜", "들은 단어 수", "전체 단어 수", "들은 번호", "처음 들은 때", "마지막으로 들은 때"];
const TZ = "Asia/Seoul";

function doGet(e) { return handle_((e && e.parameter) || {}); }
function doPost(e) {
  let p = Object.assign({}, (e && e.parameter) || {});
  try { if (e && e.postData && e.postData.contents) p = Object.assign(p, JSON.parse(e.postData.contents)); } catch (err) {}
  return handle_(p);
}
function out_(obj, cb) {
  const s = JSON.stringify(obj);
  if (cb && /^[A-Za-z_$][\w$]{0,60}$/.test(cb)) return ContentService.createTextOutput(cb + "(" + s + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
function handle_(p) {
  const cb = p.cb;
  try {
    if (p.a === "log") return out_(log_(p), cb);
    if (p.a === "ping") return out_(p.key === KEY ? { ok: true, v: ${SCRIPT_VERSION}, sheet: SpreadsheetApp.getActiveSpreadsheet().getUrl() } : { ok: false, v: ${SCRIPT_VERSION} }, cb);
    if (p.a === "read") return out_(p.key === KEY ? read_(p) : { ok: false, error: "key" }, cb);
    return out_({ ok: false, error: "action" }, cb);
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) }, cb);
  }
}
function clip_(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n); }
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    write_(sh, 1, HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}
// 글자 그대로 저장 (시트가 날짜·숫자로 바꾸지 않게)
function write_(sh, r, row) {
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  const rg = sh.getRange(r, 1, 1, row.length);
  rg.setNumberFormat("@");
  rg.setValues([row.map(String)]);
}
function log_(p) {
  const cls = clip_(p.cls, 12), name = clip_(p.name, 30), list = clip_(p.list, 60);
  if (!/^[a-z0-9]{2,12}$/.test(cls) || !name || !/^[a-z0-9-]+\.html$/.test(list)) return { ok: false, error: "bad" };
  const total = Math.max(1, Math.min(500, parseInt(p.total, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const vals = sh.getDataRange().getDisplayValues();
    let r = -1;
    for (let i = 1; i < vals.length; i++) if (vals[i][0] === cls && vals[i][1] === name && vals[i][2] === list) { r = i; break; }
    const set = {};
    const add = s => String(s || "").split(",").forEach(x => { const n = parseInt(x, 10); if (n >= 0 && n < total) set[n] = 1; });
    add(p.heard);
    if (r > 0) add(vals[r][7]);
    const ids = Object.keys(set).map(Number).sort((a, b) => a - b);
    const now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    const row = [cls, name, list, clip_(p.title, 80), clip_(p.date, 10), ids.length, total, ids.join(","), r > 0 ? vals[r][8] : now, now];
    write_(sh, r > 0 ? r + 1 : Math.max(sh.getLastRow(), 1) + 1, row);
    return { ok: true, heard: ids.length, total: total };
  } finally {
    lock.releaseLock();
  }
}
function read_(p) {
  const vals = sheet_().getDataRange().getDisplayValues();
  const cls = clip_(p.cls, 12), rows = [];
  for (let i = 1; i < vals.length; i++) {
    const v = vals[i];
    if (!v[0] || (cls && v[0] !== cls)) continue;
    rows.push({ cls: v[0], name: v[1], list: v[2], title: v[3], date: v[4], heard: Number(v[5]) || 0, total: Number(v[6]) || 0, first: v[8], last: v[9] });
  }
  return { ok: true, rows: rows };
}
`;

// 구글 Apps Script 웹 앱 부르기 (다른 사이트라서 <script> 로 부르고 콜백으로 받는다)
export function jsonp(url, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const cb = "__dv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const s = document.createElement("script");
    let done = false;
    const finish = (err, data) => {
      if (done) return; done = true; clearTimeout(t);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      s.remove();
      err ? reject(err) : resolve(data);
    };
    const t = setTimeout(() => finish(new Error("구글 시트가 응답하지 않아요")), timeout);
    window[cb] = d => finish(null, d);
    s.onerror = () => finish(new Error("구글 시트에 연결하지 못했어요"));
    s.src = cleanUrl(url) + "?" + new URLSearchParams({ ...params, cb }).toString();
    document.head.appendChild(s);
  });
}

// ---------- 학생 이름 ----------
// 한 줄에 한 명: "강수현 Rachel", "강수현Rachel", "Rachel 강수현", "Rachel" (영어 이름은 꼭 있어야 해요: 학생 화면에는 영어 이름만 나와요)
export function parseNames(text) {
  const out = [], errs = [], seen = new Set();
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    const t = line.replace(/ /g, " ").trim();
    if (!t) return;
    const ko = (t.match(/[가-힣]+/g) || []).join(" ").trim();
    const en = t.replace(/[가-힣]+/g, " ").replace(/[^A-Za-z0-9 .'-]/g, " ").replace(/\s+/g, " ").trim();
    if (!en || !/[A-Za-z]/.test(en)) { errs.push(`${i + 1}번째 줄 ‘${t}’: 영어 이름이 없어요 (학생 화면에는 영어 이름만 나와요)`); return; }
    if (en.length > 24) { errs.push(`${i + 1}번째 줄 ‘${t}’: 영어 이름이 너무 길어요`); return; }
    const k = en.toLowerCase();
    if (seen.has(k)) { errs.push(`${i + 1}번째 줄: ‘${en}’ 이름이 두 번 나와요. 같은 반 안에서는 영어 이름이 달라야 해요 (예: Leo.P, Leo.S)`); return; }
    seen.add(k);
    out.push({ ko, en });
  });
  if (out.length > 40) errs.push("한 반에 40명까지 넣을 수 있어요");
  return { list: out, errs };
}
export const formatNames = list => (list || []).map(s => (s.ko ? s.ko + " " : "") + s.en).join("\n");

// ---------- 저장소의 설정 파일 ----------
export class Listen {
  constructor(gh) { this.site = gh; this.books = gh.other("Words-Books"); this.cfg = null; this.students = null; }
  async load() {
    const [c, s] = await Promise.all([this.books.getText(PRIVATE_CFG), this.books.getText(STUDENTS)]);
    this.cfg = c ? JSON.parse(c) : null;
    const j = s ? JSON.parse(s) : {};
    this.students = { classes: (j && j.classes) || {} };
    return this;
  }
  get connected() { return !!(this.cfg && this.cfg.url && this.cfg.key); }
  namesOf(code) { return (this.students && this.students.classes[code]) || []; }
  publicJson(url) {
    const classes = {};
    for (const [code, list] of Object.entries(this.students.classes)) if (list.length) classes[code] = list.map(s => s.en);
    return JSON.stringify({ url: url || "", classes }, null, 1) + "\n";
  }
  // 반 학생 이름 저장: 비공개(한글+영어) 먼저, 그다음 공개(영어만)
  async saveNames(code, list, clsName) {
    await this.load();
    if (list.length) this.students.classes[code] = list; else delete this.students.classes[code];
    await this.books.commit({ [STUDENTS]: JSON.stringify(this.students, null, 1) + "\n" }, `${clsName || code} 학생 이름 ${list.length}명`);
    await this.site.commit({ [PUBLIC_CFG]: this.publicJson(this.cfg && this.cfg.url) }, `${clsName || code} 학생 이름 (영어 이름만, 듣기 기록용)`);
  }
  async ping(url, key) {
    const r = await jsonp(url, { a: "ping", key });
    if (!r || !r.ok) throw new Error(r && r.v ? "열쇠가 맞지 않아요. 선생님 앱에서 복사한 스크립트를 그대로 붙여 넣었는지 확인해 주세요." : "구글 시트의 응답이 이상해요");
    return r;
  }
  // 연결: 웹 앱 주소가 열쇠로 응답하면 비공개(주소+열쇠)와 공개(주소+영어 이름) 저장
  async connect(url, key) {
    url = cleanUrl(url);
    const r = await this.ping(url, key);
    await this.load();
    this.cfg = { url, key, sheet: r.sheet || "", saved: new Date().toISOString(), v: SCRIPT_VERSION };
    await this.books.commit({ [PRIVATE_CFG]: JSON.stringify(this.cfg, null, 1) + "\n" }, "듣기 기록: 구글 시트 연결");
    await this.site.commit({ [PUBLIC_CFG]: this.publicJson(url) }, "듣기 기록 켜기 (구글 시트 주소)");
  }
  // 학생 페이지에서 기록 끄기 (구글 시트와 기록은 그대로 남는다)
  async disconnect() {
    await this.load();
    this.cfg = null;
    await this.books.commit({ [PRIVATE_CFG]: null }, "듣기 기록: 연결 끊기");
    await this.site.commit({ [PUBLIC_CFG]: this.publicJson("") }, "듣기 기록 끄기");
  }
  async read(code) {
    if (!this.connected) throw new Error("구글 시트가 연결되지 않았어요");
    const r = await jsonp(this.cfg.url, { a: "read", key: this.cfg.key, cls: code });
    if (!r || !r.ok) throw new Error(r && r.error === "key" ? "열쇠가 맞지 않아요. 설정에서 다시 연결해 주세요." : "기록을 읽지 못했어요" + (r && r.error ? ` (${r.error})` : ""));
    return r.rows || [];
  }
}

// 표 한 칸의 상태: ok(다 들음) / part(일부) / none(안 들음)
export function cellState(rec) {
  if (!rec || !rec.heard) return { kind: "none" };
  return { kind: rec.heard >= rec.total ? "ok" : "part", heard: rec.heard, total: rec.total, last: rec.last };
}
