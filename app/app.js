// 단어장 만들기 화면
import { Engine, SPEEDS, VARIANTS, itemState, plain } from "./engine.js?v=24";
import { Pages, GitHub, SITE, BRAND, readData, setsOf, wordCount, datedRe } from "./site.js?v=24";
import { displayIpa } from "./g2p.js?v=24";
import * as A from "./audio.js?v=24";
import { Books, resolveRange, rangeHint } from "./books.js?v=24";
import { setupListen } from "./listen-ui.js?v=24";

const $ = id => document.getElementById(id);
const SPEED_KO = { normal: "보통", slow: "천천히", very_slow: "아주 천천히" };
const LS = { token: "wp-gh-token", draft: "wp-draft", range: "wp-last-range", time: "wp-show-time" };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const engine = new Engine();
const pages = new Pages("app/");
let gh = null, classes = [], items = [], busy = false, engineReady = false, titleTouched = false, classInfo = { code: null, entries: [] };
// '지난 단어장 고치기'로 불러온(또는 방금 올린) 단어장: 다시 올리면 이 단어장을 고친다
let editing = null; // { code, href, date, title } "지난 단어장 고치기"로 불러온 단어장 (setEditing 으로만 바꾼다)
// 단어장 정리본 (Words-Books): books = 읽기 도구, bookIdx = 반 ↔ 단어장 목록, importedPos = 가져온 단어의 품사 (발음 고르기에 씀)
let books = null, bookIdx = null, bookIdxErr = null, lastRangeTitle = null, importedPos = new Map();
// 준비해 둔 단어장 (Words-Books/drafts): drafts = 목록, draftEditing = "고치기"로 불러온 준비 단어장 { id, title }
let drafts = [], draftEditing = null;
// 누가 들었나요? (listen-ui.js)
let listenUI = null;
const dayLabel = date => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""); return m ? `${+m[2]}월 ${+m[3]}일` : date; };

// ---------- 시작 ----------
// 접었다 펴는 칸(준비해 둔 단어장 · 단어장에서 가져오기 · 지난 단어장 고치기)은 선생님이 마지막으로 둔 대로 (2026-11-14)
for (const id of ["draftFold", "bookBox", "prevBox"]) {
  const d = $(id), k = "wp-fold:" + id, v = store.get(k);
  if (v === "1" || v === "0") d.open = v === "1";
  d.addEventListener("toggle", () => store.set(k, d.open ? "1" : "0"));
}
init().catch(e => console.error(e));

async function init() {
  const tok = store.get(LS.token);
  if (tok) { gh = new GitHub(tok); books = new Books(gh); }
  $("tokenBanner").hidden = !!gh;

  await loadClasses();
  listenUI = setupListen({ $, h, store, pages, getGh: () => gh, getClasses: () => classes, dayLabel, isFuture, openSettings });
  listenUI.start().catch(e => console.error(e));
  loadBookIndex();
  loadDrafts();
  restoreDraft();
  if (!$("date").value) $("date").value = today();
  if (!titleTouched) $("title").value = "";  // 비워 두면 올릴 때 "○월 ○일 영어 단어"로 (다음 시험 칸)
  onClassChange();

  pages.load().catch(e => showErr("페이지 틀을 불러오지 못했어요: " + e.message));
  loadFixes();
  setEngine("발음 사전 불러오는 중", 0.02);
  try {
    await engine.loadDict("app/dict-us.json?v=24");
    await engine.loadModels((p, txt) => setEngine(`AI 준비 중 · ${txt}`, 0.05 + 0.95 * p));
    engineReady = true;
    setEngine(engine.device === "webgpu" ? "AI 준비됨 (그래픽 가속)" : "AI 준비됨", 1, "ready");
    $("make").disabled = false;
    $("makeNote").textContent = engine.device === "webgpu"
      ? "처음 만들 때는 1~2분쯤 걸려요."
      : "이 컴퓨터에서는 그래픽 가속을 쓸 수 없어 단어 하나에 4초쯤 걸려요. 크롬 설정 → 시스템 → ‘가능한 경우 그래픽 가속 사용’을 켜고 크롬을 다시 열면 빨라질 수 있어요.";
  } catch (e) {
    console.error(e);
    setEngine("AI를 불러오지 못했어요", 0, "err");
    $("makeNote").textContent = "인터넷 연결을 확인하고 새로고침해 주세요. (" + (e.message || e) + ")";
  }
}

async function loadFixes() {
  try {
    const t = gh ? await gh.getText("app/fixes.json") : await (await fetch("app/fixes.json", { cache: "no-cache" })).text();
    engine.fixes = t ? JSON.parse(t) : {};
  } catch (e) { engine.fixes = {}; }
}

function setEngine(text, p, cls = "") {
  $("engineText").textContent = text;
  $("engineBar").style.width = Math.round(p * 100) + "%";
  $("engine").className = "pill " + cls;
  $("engine").querySelector(".bar").hidden = cls === "ready";
}

function today() {
  const d = new Date(); const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function autoTitle(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  return m ? `${+m[2]}월 ${+m[3]}일 영어 단어` : "영어 단어";
}

// ---------- 반 ----------
async function loadClasses() {
  let txt = null;
  try { if (gh) txt = await gh.getText("classes.json"); } catch (e) {}
  if (!txt) { try { txt = await (await fetch("classes.json", { cache: "no-cache" })).text(); } catch (e) {} }
  try { classes = JSON.parse(txt).classes; } catch (e) { classes = []; }
  const sel = $("cls"), prev = sel.value;
  sel.replaceChildren(...classes.map(c => h("option", { value: c.code }, c.name)));
  if (prev && classes.some(c => c.code === prev)) sel.value = prev;
  renderClassList();
  if (listenUI) listenUI.refreshClasses();
}
const curClass = () => classes.find(c => c.code === $("cls").value);

async function onClassChange() {
  renderBookBox();
  const c = curClass(); if (!c) return;
  classInfo = { code: c.code, entries: [] };
  $("prevBox").hidden = true;
  let html = null;
  try { html = gh ? await gh.getText(`${c.code}.html`) : await (await fetch(`${c.code}.html`, { cache: "no-cache" })).text(); } catch (e) {}
  if (classInfo.code !== c.code) return;
  classInfo.entries = pages.entriesOf(c, html);
  if (classInfo.entries.length) {
    $("prevSel").replaceChildren(...classInfo.entries.map(e => h("option", { value: e.href },
      `${dayLabel(e.date)} · ${e.title}` + (isFuture(e.showFrom) ? ` (⏰ ${fmtWhen(e.showFrom)}부터 보임)` : ""))));
    $("prevBox").hidden = false;
  }
  updatePrevNow();
}

$("cls").addEventListener("change", () => { setEditing(null); delMsg(""); saveDraft(); onClassChange(); clearDone(); });
$("date").addEventListener("change", () => {
  if (editing && editing.date !== $("date").value) setEditing(null);
  saveDraft(); clearDone();
});

// 불러온 단어장을 고치는 중이면 눈에 보이게 (올리면 그 단어장이 바뀐다는 것을 알 수 있게)
function setEditing(v) {
  editing = v;
  if (v && draftEditing) draftEditing = null;
  const bar = $("editBar");
  if (!v) { bar.hidden = true; bar.replaceChildren(); return; }
  bar.replaceChildren(
    h("span", {}, `${dayLabel(v.date)} “${v.title}” 단어장을 고치는 중이에요. 올리면 이 단어장이 새 내용으로 바뀌어요.`),
    h("button", { class: "btn ghost small", type: "button", onclick: () => setEditing(null) }, "고치지 않고 새 단어장으로 만들기"));
  bar.hidden = false;
}
$("title").addEventListener("input", () => { titleTouched = true; saveDraft(); });
$("words").addEventListener("input", saveDraft);

$("prevLoad").addEventListener("click", async () => {
  const href = $("prevSel").value; if (!href) return;
  try {
    const html = gh ? await gh.getText(href) : await (await fetch(href, { cache: "no-cache" })).text();
    const d = readData(html); if (!d) throw new Error("단어장을 읽지 못했어요");
    $("date").value = d.date; $("title").value = d.title; titleTouched = true;
    $("words").value = d.words.map(w => `${w.w}\t${w.m}`).join("\n");
    setEditing({ code: curClass().code, href, date: d.date, title: d.title });
    // 예약해 둔 단어장을 고치면 예약도 그대로 (모르고 바로 보이게 되지 않도록)
    dockSched.set(isFuture(d.showFrom) ? d.showFrom : null);
    saveDraft(); clearDone();
    $("words").focus();
  } catch (e) { showErr(e.message); }
});

// ---------- 예약 (학생에게 보이기 시작하는 때) ----------
// 학원은 한국 시간이라 +09:00 으로 저장한다. 학생 페이지는 이 시각과 기기 시계를 비교해 보일 단어장을 고른다.
const isFuture = iso => !!iso && Date.parse(iso) > Date.now();
function fmtWhen(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || ""); if (!m) return iso || "";
  const dow = "일월화수목금토"[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const hh = +m[4], ap = hh < 12 ? "오전" : "오후", h12 = hh % 12 || 12;
  return `${+m[2]}월 ${+m[3]}일(${dow}) ${ap} ${h12}:${m[5]}`;
}
let schedSeq = 0;
// "학생에게 보이기 ( ) 올리면 바로 ( ) 정한 때부터 [날짜] [시각]" 묶음. get() → { showFrom } 또는 { error }
function makeSched(defaultDate) {
  const n = ++schedSeq;
  const now = h("input", { type: "radio", name: `when${n}`, value: "now", checked: true });
  const later = h("input", { type: "radio", name: `when${n}`, value: "later" });
  const date = h("input", { type: "date", "aria-label": "보이기 시작하는 날짜", disabled: true });
  const time = h("input", { type: "time", "aria-label": "보이기 시작하는 시각", step: 300, disabled: true });
  const hint = h("span", { class: "wh" });
  const el = h("div", { class: "sched" }, h("b", {}, "학생에게 보이기"),
    h("label", {}, now, "올리면 바로"), h("label", {}, later, "정한 때부터"), date, time, hint);
  const iso = () => /^\d{4}-\d{2}-\d{2}$/.test(date.value) && /^\d{2}:\d{2}$/.test(time.value) ? `${date.value}T${time.value}:00+09:00` : null;
  const upd = () => {
    const on = later.checked; date.disabled = time.disabled = !on;
    if (on && !date.value) date.value = (typeof defaultDate === "function" ? defaultDate() : defaultDate) || today();
    if (on && !time.value) time.value = store.get(LS.time) || "19:00";
    const v = on ? iso() : null;
    hint.className = "wh";
    if (!on) hint.textContent = "";
    else if (!v) hint.textContent = "날짜와 시각을 골라 주세요";
    else if (!isFuture(v)) { hint.textContent = "이미 지난 시각이에요"; hint.className = "wh bad"; }
    else hint.textContent = `→ ${fmtWhen(v)}부터 반 주소 맨 위에 나와요`;
  };
  [now, later, date, time].forEach(x => x.addEventListener("input", upd));
  [now, later].forEach(x => x.addEventListener("change", upd));
  return {
    el,
    get() {
      if (!later.checked) return { showFrom: null };
      const v = iso();
      if (!v) return { error: "학생에게 보이기 시작할 날짜와 시각을 골라 주세요." };
      if (!isFuture(v)) return { error: "보이기 시작할 때가 이미 지났어요. 바로 보이게 하려면 ‘올리면 바로’를 골라 주세요." };
      store.set(LS.time, time.value);
      return { showFrom: v };
    },
    set(v) {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v || "");
      if (m) { later.checked = true; date.value = m[1]; time.value = m[2]; } else { now.checked = true; }
      upd();
    },
  };
}
const dockSched = makeSched(() => $("date").value);
$("dockSched").replaceWith(Object.assign(dockSched.el, { id: "dockSched" }));

// 반 주소 맨 위에는 날짜가 가장 늦은 단어장이 나온다. 이 단어장보다 늦은 날짜의 단어장이 (보일 때) 이미 있으면 그것을 돌려준다.
function laterListAt(entries, date, title, showFrom) {
  const t = showFrom ? Date.parse(showFrom) : Date.now();
  return entries.filter(e => !(e.date === date && e.title === title))
    .filter(e => !e.showFrom || Date.parse(e.showFrom) <= t)
    .sort((a, b) => b.date.localeCompare(a.date)).find(e => e.date > date) || null;
}
function lateMsg(e, date, showFrom) {
  return `${showFrom ? "예약 시각이 되어도" : "올려도"} 반 주소 맨 위에 나오지 않고 지난 단어장에 들어가요. ${dayLabel(e.date)} “${e.title}” 단어장이 이 단어장(${dayLabel(date)})보다 날짜가 늦어서예요. 날짜를 숙제 내는 날짜로 바꿔 주세요. 그래도 올리려면 올리기를 누르세요.`;
}
function updatePrevNow() {
  const e = classInfo.entries.find(x => x.href === $("prevSel").value);
  $("prevNow").hidden = !(e && isFuture(e.showFrom));
}
$("prevSel").addEventListener("change", updatePrevNow);
$("prevNow").addEventListener("click", async () => {
  const c = curClass(), e = classInfo.entries.find(x => x.href === $("prevSel").value);
  if (!c || !e || busy) return;
  if (!gh) return delMsg("", "바꾸려면 먼저 설정에서 GitHub 열쇠를 넣어 주세요.");
  busy = true; setBusy(true); delMsg("ok", "지금 바로 보이게 바꾸는 중…");
  try {
    const cur = await gh.getText(`${c.code}.html`);
    const r = await pages.buildShowNowFiles(c, e.href, cur, { getData: href => gh.getText(href) });
    await gh.commit(r.files, `${c.name} ${e.title} 예약 없이 바로 보이기 (단어장 앱)`);
    await onClassChange();
    delMsg("ok", `✓ “${e.title}” 단어장을 지금 바로 보이게 바꿨어요. 1~2분 뒤 반 주소에 나와요.`);
  } catch (err) { console.error(err); delMsg("", "바꾸지 못했어요: " + (err.message || err)); }
  finally { busy = false; setBusy(false); }
});

// ---------- 준비해 둔 단어장 (미리 만들어 저장, 숙제 낼 때 올리기) ----------
const clsName = code => (classes.find(c => c.code === code) || { name: code }).name;
function draftMsg(text, ok) { const st = $("draftStatus"); st.textContent = text || ""; st.className = "status" + (ok === true ? " ok" : ok === false ? " bad" : ""); }
async function loadDrafts() {
  if (!books) { drafts = []; renderDrafts(); return; }
  try { drafts = await books.drafts(); } catch (e) { console.error(e); drafts = []; }
  renderDrafts();
}
function setDraftEditing(v) {
  draftEditing = v;
  const bar = $("editBar");
  if (!v) { if (!editing) { bar.hidden = true; bar.replaceChildren(); } return; }
  if (editing) setEditing(null);
  bar.replaceChildren(
    h("span", {}, `준비해 둔 “${v.title}” 단어장을 고치는 중이에요. 발음을 다시 만든 뒤 저장해 두기를 누르면 이 단어장이 바뀌어요.`),
    h("button", { class: "btn ghost small", type: "button", onclick: () => setDraftEditing(null) }, "고치지 않고 새 단어장으로 만들기"));
  bar.hidden = false;
}
function renderDrafts() {
  const card = $("draftCard"), ul = $("draftList");
  card.hidden = !drafts.length;
  // 접혀 있을 때 보이는 한 줄 요약: 개수 + 앞의 3개 이름
  $("draftCount").textContent = `${drafts.length}개`;
  $("draftPeek").replaceChildren(...drafts.slice(0, 3).map(d => h("span", {}, `${clsName(d.cls)} · ${d.title}`)),
    ...(drafts.length > 3 ? [h("span", {}, `외 ${drafts.length - 3}개`)] : []));
  ul.replaceChildren(...drafts.map(d => {
    const li = h("li", {});
    const panel = h("div", { class: "panel", hidden: true });
    const close = () => { panel.hidden = true; panel.className = "panel"; panel.replaceChildren(); };
    const row = h("div", { class: "row1" },
      h("div", {}, h("div", { class: "t" }, `${clsName(d.cls)} · ${d.title}`),
        h("div", { class: "s" }, `${dayLabel(d.date)} · 단어 ${d.n}개 · ${dayLabel((d.saved || "").slice(0, 10))}에 저장`)),
      h("div", { class: "acts" },
        h("button", { class: "btn ghost small", type: "button", onclick: () => previewDraft(d) }, "학생 화면 미리 보기"),
        h("button", { class: "btn quiet small", type: "button", onclick: () => editDraft(d) }, "고치기"),
        h("button", { class: "btn quiet small del", type: "button", onclick: () => {
          panel.className = "panel bad"; panel.hidden = false;
          panel.replaceChildren(h("span", {}, `준비해 둔 “${d.title}” 단어장을 지울까요? 학생 페이지에는 원래 없어서 학생에게는 아무 변화가 없어요.`),
            h("div", { class: "acts" },
              h("button", { class: "btn small", type: "button", style: "background:var(--bad);color:#fff", onclick: () => deleteDraft(d) }, "지우기"),
              h("button", { class: "btn quiet small", type: "button", onclick: close }, "취소")));
        } }, "지우기"),
        h("button", { class: "btn small", type: "button", onclick: () => {
          const sc = makeSched(d.date);
          panel.className = "panel"; panel.hidden = false;
          const go = h("button", { class: "btn small", type: "button", onclick: () => publishDraft(d, sc, go) }, "올리기");
          panel.replaceChildren(h("div", {}, h("b", {}, `${clsName(d.cls)} · ${d.title}`), ` ${dayLabel(d.date)} · 단어 ${d.n}개를 올릴까요?`),
            sc.el, h("div", { class: "acts" }, go, h("button", { class: "btn quiet small", type: "button", onclick: close }, "취소")));
        } }, "올리기")));
    li.append(row, panel);
    return li;
  }));
}
async function previewDraft(meta) {
  const w = window.open("about:blank", "_blank");
  try {
    const d = await books.getDraft(meta.id);
    const c = classes.find(x => x.code === d.cls) || { code: d.cls, name: d.cls };
    const html = pages.datedPage(c, `${c.code}-${d.date}.html`, { date: d.date, title: d.title, words: d.words });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    if (w) w.location = url; else draftMsg("새 탭이 막혔어요. 브라우저 주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트를 허용해 주세요.", false);
  } catch (e) { if (w) w.close(); draftMsg("미리 보기를 열지 못했어요: " + (e.message || e), false); }
}
async function editDraft(meta) {
  if (busy) return;
  try {
    const d = await books.getDraft(meta.id);
    if (classes.some(c => c.code === d.cls)) { $("cls").value = d.cls; await onClassChange(); }
    $("date").value = d.date; $("title").value = d.title; titleTouched = true;
    $("words").value = d.words.map(w => `${w.w}\t${w.m}`).join("\n");
    items = []; $("list").replaceChildren(); $("resultCard").hidden = true; $("dock").hidden = true; clearDone();
    setEditing(null); setDraftEditing({ id: d.id, title: d.title });
    saveDraft(); draftMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" }); $("words").focus();
  } catch (e) { draftMsg("불러오지 못했어요: " + (e.message || e), false); }
}
async function deleteDraft(meta) {
  if (busy) return;
  busy = true; setBusy(true); draftMsg("지우는 중…");
  try {
    drafts = await books.deleteDraft(meta.id, `${clsName(meta.cls)} ${meta.title} 준비 단어장 지움 (단어장 앱)`);
    if (draftEditing && draftEditing.id === meta.id) setDraftEditing(null);
    renderDrafts(); draftMsg(`✓ 준비해 둔 “${meta.title}” 단어장을 지웠어요.`, true);
  } catch (e) { console.error(e); draftMsg("지우지 못했어요: " + (e.message || e), false); }
  finally { busy = false; setBusy(false); }
}
function removeDraftQuietly(id, message) {
  books.deleteDraft(id, message).then(list => { drafts = list; renderDrafts(); }).catch(e => console.error(e));
}
// 이번 단어장에서 기본과 다른 소리를 쓴 단어 (준비 단어장에 같이 저장했다가 올릴 때 fixes.json 에 넣는다)
function fixesOfItems() {
  const fx = {};
  for (const it of items) if (it.ps && it.variantUsed && it.variantUsed !== "plain") fx[it.ps] = it.variantUsed;
  return fx;
}
// 아래 막대의 '저장해 두기'
$("saveDraft").addEventListener("click", async () => {
  if (busy || !ready()) return;
  if (!gh || !books) { openSettings(); $("tokenStatus").textContent = "저장해 두려면 먼저 GitHub 열쇠를 넣어 주세요."; $("tokenStatus").className = "status bad"; return; }
  const c = curClass(); if (!c) return;
  busy = true; setBusy(true); $("saveDraft").textContent = "저장하는 중…";
  try {
    const set = currentSet();
    const id = draftEditing ? draftEditing.id : `${c.code}-${set.date}-${Date.now().toString(36)}`;
    const d = { id, cls: c.code, date: set.date, title: set.title, words: set.words, fixes: fixesOfItems(), saved: new Date().toISOString() };
    drafts = await books.saveDraft(d, `${c.name} ${set.title} 준비해 둠 (단어장 앱)`);
    const wasEditing = !!draftEditing;
    setDraftEditing(null); setEditing(null); renderDrafts();
    const card = $("doneCard");
    card.replaceChildren(
      h("p", {}, h("b", {}, `“${set.title}” 단어장을 ${wasEditing ? "고쳐서 " : ""}준비해 두었어요.`), " 학생에게는 아직 안 보여요. 숙제를 낼 때 맨 위 ‘준비해 둔 단어장’에서 올리기를 누르세요."),
      h("div", { class: "copyrow" }, h("button", { class: "btn ghost small", type: "button", onclick: resetForNext }, "다음 단어장 만들기")));
    card.hidden = false; card.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) { console.error(e); showErr("저장하지 못했어요: " + (e.message || e)); }
  finally { busy = false; setBusy(false); $("saveDraft").textContent = "저장해 두기"; }
});
// 준비해 둔 단어장 올리기 (바로 또는 예약)
async function publishDraft(meta, sc, btn, confirmed = false) {
  if (busy) return;
  if (!gh) return draftMsg("올리려면 먼저 설정에서 GitHub 열쇠를 넣어 주세요.", false);
  const c = classes.find(x => x.code === meta.cls);
  if (!c) return draftMsg(`반 목록에 ${meta.cls} 반이 없어요. 설정에서 반을 확인해 주세요.`, false);
  const when = sc.get();
  if (when.error) return draftMsg(when.error, false);
  busy = true; setBusy(true); btn.textContent = "올리는 중…"; draftMsg("");
  try {
    const d = await books.getDraft(meta.id);
    const cur = await gh.getText(`${c.code}.html`);
    const entries = pages.entriesOf(c, cur);
    const warn = [];
    if (entries.some(e => e.date === d.date && e.title === d.title)) warn.push(`${c.name}에 ${dayLabel(d.date)} “${d.title}” 단어장이 이미 있어요. 올리면 그 단어장이 이 내용으로 바뀌어요.`);
    const later = laterListAt(entries, d.date, d.title, when.showFrom);
    if (later) warn.push(lateMsg(later, d.date, when.showFrom).replace("날짜를 숙제 내는 날짜로 바꿔 주세요.", "날짜를 바꾸려면 고치기를 누르세요.").replace(" 그래도 올리려면 올리기를 누르세요.", ""));
    if (warn.length) warn.push("그래도 올리려면 ‘그래도 올리기’를 누르세요.");
    if (!confirmed && warn.length) {
      busy = false; setBusy(false);
      const again = h("button", { class: "btn small", type: "button" }, "그래도 올리기");
      again.addEventListener("click", () => publishDraft(meta, sc, again, true));
      btn.replaceWith(again);
      return draftMsg(warn.join(" "), false);
    }
    const set = { date: d.date, title: d.title, words: d.words, ...(when.showFrom ? { showFrom: when.showFrom } : {}) };
    const existing = await gh.listRoot();
    const r = await pages.buildSetFiles(c, set, cur, { getData: href => gh.getText(href), existing });
    let base = {};
    try { const t = await gh.getText("app/fixes.json"); if (t) base = JSON.parse(t); } catch (e) {}
    const fx = { ...base, ...(d.fixes || {}) };
    if (JSON.stringify(fx) !== JSON.stringify(base)) r.files["app/fixes.json"] = JSON.stringify(fx, null, 2) + "\n";
    await gh.commit(r.files, `${c.name} ${d.title} ${r.replacing ? "고침" : "올림"} (준비해 둔 단어장)`);
    if (r.files["app/fixes.json"]) engine.fixes = fx;
    drafts = await books.deleteDraft(meta.id, `${c.name} ${d.title} 올려서 준비 목록에서 뺌 (단어장 앱)`).catch(e => { console.error(e); return drafts.filter(x => x.id !== meta.id); });
    if (draftEditing && draftEditing.id === meta.id) setDraftEditing(null);
    renderDrafts();
    showDone(c, set, r);
    if (curClass() && curClass().code === c.code) onClassChange();
  } catch (e) {
    console.error(e); draftMsg("올리지 못했어요: " + (e.message || e), false);
  } finally { busy = false; setBusy(false); if (btn.isConnected && btn.textContent === "올리는 중…") btn.textContent = "올리기"; }
}

// ---------- 잘못 올린 단어장 지우기 ----------
function delMsg(cls, ...kids) { const b = $("delAsk"); b.className = "delask" + (cls ? " " + cls : ""); b.replaceChildren(...kids); b.hidden = !kids.length; }
$("prevDel").addEventListener("click", () => {
  const c = curClass(), href = $("prevSel").value;
  const e = classInfo.entries.find(x => x.href === href);
  if (!c || !e) return;
  if (!gh) return delMsg("", "지우려면 먼저 설정에서 GitHub 열쇠를 넣어 주세요.");
  delMsg("", `${dayLabel(e.date)} “${e.title}” 단어장을 지울까요? 반 주소에서 사라지고, 이 단어장만 주소로 들어오면 반 주소로 넘어가요.`,
    h("button", { class: "btn small", type: "button", onclick: () => deleteSet(c, e) }, "지우기"),
    h("button", { class: "btn quiet small", type: "button", onclick: () => delMsg("") }, "취소"));
});
$("prevSel").addEventListener("change", () => delMsg(""));
async function deleteSet(c, e) {
  if (busy) return;
  busy = true; setBusy(true); delMsg("", "지우는 중…");
  try {
    const cur = await gh.getText(`${c.code}.html`);
    const r = await pages.buildDeleteFiles(c, e.href, cur, { getData: href => gh.getText(href) });
    await gh.commit(r.files, `${c.name} ${e.title} 지움 (단어장 앱)`);
    if (editing && editing.href === e.href) setEditing(null);
    clearDone();
    await onClassChange();
    delMsg("ok", `✓ ${dayLabel(e.date)} “${e.title}” 단어장을 지웠어요. 1~2분 뒤 학생 주소에 반영돼요.` + (r.left ? "" : " 이제 이 반에는 올라온 단어장이 없어요."));
  } catch (err) {
    console.error(err); delMsg("", "지우지 못했어요: " + (err.message || err));
  } finally { busy = false; setBusy(false); }
}

// ---------- 단어장에서 가져오기 (비공개 저장소 Words-Books 의 정리본) ----------
async function loadBookIndex() {
  bookIdx = null; bookIdxErr = null; renderBookBox();
  if (!books) return;
  try { bookIdx = await books.index(true); } catch (e) { console.error(e); bookIdxErr = e; }
  renderBookBox(); renderClassList();
}
function bookMsg(cls, ...kids) {
  const m = $("bookMsg"); m.className = "fmsg " + cls; m.replaceChildren(...kids); m.hidden = !kids.length;
}
// 지난번 범위는 반·단어장마다 ("e5b|bricks-voca-2300"), 반마다 마지막에 쓴 단어장 ("e5b|book")도 기억 (반에 단어장이 여럿일 때)
const lastRanges = () => { try { return JSON.parse(store.get(LS.range) || "{}"); } catch (e) { return {}; } };
function saveLastRange(code, id, rng) { const o = lastRanges(); o[`${code}|${id}`] = rng; o[`${code}|book`] = id; store.set(LS.range, JSON.stringify(o)); }
const lastRangeOf = (code, id, single) => { const o = lastRanges(); return o[`${code}|${id}`] || (single ? o[code] : null) || null; };
// 반에 단어장이 여럿이거나 다른 반 단어장을 쓸 때는 다음 시험 칸에 단어장 이름도 붙인다 ("Bricks 2300 - unit 1") → 같은 날 두 단어장이 같은 제목으로 겹치지 않게
const bookShort = id => { const b = bookIdx && bookIdx.books[id]; return b ? (b.short || b.book.replace(/\s*\(.*?\)\s*/g, " ").replace(/\bVocabulary\b/, "").replace(/\s+/g, " ").trim()) : ""; };
function titleFor(code, id, rng) {
  const mine = ((bookIdx && bookIdx.classes[code]) || []).filter(x => bookIdx.books[x]);
  return mine.length === 1 && mine[0] === id ? rng : `${bookShort(id)} - ${rng}`;
}
const posKey = (w, m) => `${String(w).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase()}\t${String(m).replace(/\s+/g, " ").trim()}`;
// 받침에 따라 "로/으로" (숫자는 읽는 소리로)
function ro(word) {
  const ch = String(word).trim().slice(-1), code = ch.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) { const jong = (code - 0xAC00) % 28; return jong === 0 || jong === 8 ? "로" : "으로"; }
  if (/[0-9]/.test(ch)) return "036".includes(ch) ? "으로" : "로";
  return "로";
}

function renderBookBox() {
  const box = $("bookBox"), c = curClass();
  box.hidden = !c;
  if (!c) return;
  $("bookRow").hidden = true; $("bookHint").textContent = ""; bookMsg("info");
  if (!gh) return bookMsg("info", "설정에서 GitHub 열쇠를 넣으면 정리해 둔 단어장에서 단어를 가져올 수 있어요.");
  if (bookIdxErr) return bookMsg("bad", "단어장 저장소(Words-Books)를 읽지 못했어요. GitHub 열쇠 설정에 Words-Books 저장소가 들어 있는지 확인해 주세요.");
  if (!bookIdx) return bookMsg("info", "단어장 목록을 불러오는 중…");
  const all = bookIdx.books, mine = (bookIdx.classes[c.code] || []).filter(id => all[id]);
  if (!mine.length) {
    return bookMsg("info", "이 반에는 연결된 단어장이 없어요. 지금처럼 아래 2번 칸에 단어를 붙여넣으시면 돼요.",
      h("button", { class: "btn ghost small", type: "button", onclick: openSettings }, "설정에서 단어장 연결하기"));
  }
  const others = Object.keys(all).filter(id => !mine.includes(id));
  $("bookSel").replaceChildren(...mine.map(id => h("option", { value: id }, all[id].book)),
    ...(others.length ? [h("optgroup", { label: "다른 반 단어장" }, ...others.map(id => h("option", { value: id }, all[id].book)))] : []));
  $("bookRow").hidden = false;
  const lastBook = lastRanges()[`${c.code}|book`];
  if (lastBook && mine.includes(lastBook)) $("bookSel").value = lastBook;
  $("rangeIn").value = "";
  updateBookHint();
}
async function updateBookHint() {
  const id = $("bookSel").value; if (!id || !books) return;
  $("bookHint").textContent = "";
  try {
    const b = await books.book(id);
    if ($("bookSel").value !== id) return;
    const hint = rangeHint(b);
    $("bookHint").replaceChildren("있는 범위: ", h("b", {}, hint.have), " · 예: " + hint.examples.join(" · "));
    const c = curClass(), mine = c ? (bookIdx.classes[c.code] || []) : [];
    const last = c ? lastRangeOf(c.code, id, mine.length === 1) : null;
    $("rangeIn").placeholder = last ? `지난번: ${last}` : "예: " + hint.examples[0];
  } catch (e) { $("bookHint").textContent = "단어장을 읽지 못했어요: " + (e.message || e); }
}
$("bookSel").addEventListener("change", () => { bookMsg("info"); updateBookHint(); });
$("bookGet").addEventListener("click", () => importRange());
$("rangeIn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); importRange(); } });

async function importRange(confirmed = false) {
  const c = curClass(), id = $("bookSel").value, rng = $("rangeIn").value.trim();
  if (!c || !id || !books) return;
  if (!rng) return bookMsg("bad", "시험 범위를 적어 주세요. " + ($("rangeIn").placeholder || ""));
  let book;
  try { book = await books.book(id); } catch (e) { return bookMsg("bad", "단어장을 읽지 못했어요: " + (e.message || e)); }
  const r = resolveRange(book, rng);
  if (r.error) return bookMsg("bad", r.error);
  if (r.items.length > 60) return bookMsg("bad", `단어가 ${r.items.length}개라 한 번에 만들 수 있는 60개를 넘어요. 범위를 나눠서 가져와 주세요.`);
  const text = r.items.map(x => `${x.word}\t${x.meaning}`).join("\n"), cur = $("words").value.trim();
  if (cur && cur !== text && !confirmed) {
    return bookMsg("info", "2번 칸에 이미 단어가 있어요. 가져온 단어로 바꿀까요?",
      h("button", { class: "btn small", type: "button", onclick: () => importRange(true) }, "바꾸기"),
      h("button", { class: "btn quiet small", type: "button", onclick: () => bookMsg("info") }, "취소"));
  }
  $("words").value = text;
  importedPos = new Map(r.items.filter(x => x.pos && x.pos.length).map(x => [posKey(x.word, x.meaning), x.pos]));
  let titleNote = "";
  if (!titleTouched || !$("title").value.trim() || $("title").value === lastRangeTitle) {
    const t = titleFor(c.code, id, rng);
    $("title").value = t; lastRangeTitle = t; titleTouched = true;
    titleNote = ` 다음 시험 칸도 “${t}”${ro(t)} 채웠어요.`;
  }
  saveLastRange(c.code, id, rng); saveDraft(); clearDone(); showErr("");
  bookMsg("ok", `✓ ${rng}에서 단어 ${r.items.length}개를 가져왔어요.${titleNote} 고칠 게 있으면 아래 2번 칸에서 고친 다음 발음 만들기를 눌러 주세요.`);
}

// 설정 → 반 목록: 반마다 쓰는 단어장
function bookPicker(c) {
  if (!gh || !bookIdx) return null;
  const cur = (bookIdx.classes[c.code] || []).find(id => bookIdx.books[id]) || "";
  const sel = h("select", { "aria-label": `${c.name} 단어장` }, h("option", { value: "" }, "연결 안 함"),
    ...Object.entries(bookIdx.books).map(([id, b]) => h("option", { value: id }, b.book)));
  sel.value = cur;
  sel.addEventListener("change", () => setClassBook(c, sel.value, sel, cur));
  return h("span", { class: "book" }, "단어장", sel);
}
async function setClassBook(c, id, sel, prev) {
  sel.disabled = true;
  const name = id ? bookIdx.books[id].book : "연결 안 함";
  classMsg(`${c.name} 단어장을 바꾸는 중…`);
  try {
    bookIdx = await books.setClassBook(c.code, id, `${c.name} 단어장: ${name} (단어장 앱)`);
    classMsg(`${c.name}: ${id ? `“${name}”${ro(name)} 바꿨어요.` : "단어장 연결을 끊었어요."}`, true);
    renderBookBox(); renderClassList();
  } catch (e) {
    console.error(e); sel.value = prev; sel.disabled = false;
    classMsg("단어장을 바꾸지 못했어요: " + (e.message || e), false);
  }
}

// ---------- 임시 저장 ----------
function saveDraft() {
  store.set(LS.draft, JSON.stringify({ cls: $("cls").value, date: $("date").value, title: $("title").value, titleTouched, text: $("words").value, pos: [...importedPos], rangeTitle: lastRangeTitle }));
}
function restoreDraft() {
  try {
    const d = JSON.parse(store.get(LS.draft) || "null"); if (!d) return;
    if (d.cls && classes.some(c => c.code === d.cls)) $("cls").value = d.cls;
    if (d.date) $("date").value = d.date;
    titleTouched = !!d.titleTouched; if (d.title) $("title").value = d.title;
    if (d.text) $("words").value = d.text;
    if (Array.isArray(d.pos)) importedPos = new Map(d.pos);
    if (d.rangeTitle) lastRangeTitle = d.rangeTitle;
  } catch (e) {}
}

// ---------- 단어 읽기 ----------
function parse(text) {
  const out = [], errs = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.replace(/ /g, " ").trim();
    if (!line) return;
    line = line.replace(/^(\d+\s*[.)]|[-•·*▪︎])\s*/, "").replace(/[’‘]/g, "'");
    // 탭으로 나뉜 줄 (단어장에서 가져오기, 엑셀 붙여넣기): 첫 칸이 단어, 나머지가 뜻. "How about ~ing ?" 처럼 기호가 있는 단어도 그대로
    const cells = line.split("\t").map(x => x.trim()).filter(Boolean);
    if (cells.length >= 3 && /^\d+[.)]?$/.test(cells[0])) cells.shift();
    if (cells.length >= 2 && /[A-Za-z]/.test(cells[0])) { out.push({ word: cells[0].replace(/\s+/g, " "), meaning: cells.slice(1).join(" ") }); return; }
    // 앞쪽의 영어 부분이 단어, 그 뒤 전부가 뜻 (숫자·괄호·영어 설명이 섞여도 됨)
    const m = line.match(/^[A-Za-z][A-Za-z' .\-]*/);
    if (!m) { errs.push(`${i + 1}번째 줄 "${raw.trim()}": 줄 맨 앞에서 영어 단어를 찾지 못했어요.`); return; }
    let en = m[0], ko = line.slice(en.length);
    en = en.replace(/[\s\-–—]+$/, "").trim().replace(/\s+/g, " ");
    ko = ko.replace(/^[\s:=\-–—|,;/]+/, "").trim();
    if (!en) { errs.push(`${i + 1}번째 줄 "${raw.trim()}": 영어 단어를 찾지 못했어요.`); return; }
    out.push({ word: en, meaning: ko });
  });
  return { items: out, errs };
}

function showErr(msg) { $("errs").textContent = msg || ""; }

// ---------- 발음 만들기 ----------
$("make").addEventListener("click", makeAll);

async function makeAll() {
  if (busy || !engineReady) return;
  showErr("");
  const { items: parsed, errs } = parse($("words").value);
  if (errs.length) { showErr(errs.join("\n")); return; }
  if (!parsed.length) { showErr("단어를 한 줄에 하나씩 적어 주세요. 예: apple 사과"); return; }
  if (parsed.length > 60) { showErr("한 번에 60개까지 만들 수 있어요."); return; }
  clearDone();
  busy = true; setBusy(true);
  for (const it of parsed) { const p = importedPos.get(posKey(it.word, it.meaning)); if (p && p.length) it.pos = p; }
  items = parsed;
  try {
    for (const it of items) await engine.prepare(it);
    const none = items.filter(it => !it.ps);
    if (none.length) { showErr(`발음을 만들 수 없는 단어가 있어요: ${none.map(it => it.word).join(", ")}. 철자를 확인해 주세요.`); return; }
    $("resultCard").hidden = false; $("dock").hidden = false;
    renderList(); updateSummary();
    const n = items.length, verifySteps = n * SPEEDS.length;
    let step = 0;
    const tick = (label) => { step++; setProg(label, step / (n + verifySteps)); };
    for (const it of items) { await engine.makeAudio(it); renderItem(it); tick(`음성 만드는 중 ${items.indexOf(it) + 1}/${n}`); }
    for (const [key] of SPEEDS.slice().reverse()) {
      await engine.verify(items, key, () => tick(SPEEDS.length > 1 ? `음성인식으로 확인 중 (${SPEED_KO[key]})` : "음성인식으로 확인 중"));
      items.forEach(renderItem);
    }
    step = n + verifySteps; setProg("", 1);
  } catch (e) {
    console.error(e); showErr("만드는 중에 문제가 생겼어요: " + (e.message || e));
  } finally {
    busy = false; setBusy(false); $("prog").hidden = true;
    items.forEach(renderItem); updateSummary();
  }
}

function setProg(text, p) {
  $("prog").hidden = false; $("progText").textContent = text; $("progBar").style.width = Math.round(Math.min(1, p) * 100) + "%";
}
function setBusy(on) {
  $("make").disabled = on || !engineReady;
  $("make").textContent = on ? "만드는 중…" : "발음 만들기";
  $("publish").disabled = on; $("preview").disabled = on; $("saveDraft").disabled = on;
  document.querySelectorAll(".item button").forEach(b => { if (!b.classList.contains("playbtn")) b.disabled = on; });
}

// 단어 하나만 다시 만들기
async function regen(it, { reprepare = false } = {}) {
  if (busy) return;
  busy = true; setBusy(true);
  try {
    it.audio = null; it.check = null; it.mp3 = null; it.override = false;
    if (reprepare) { it.variants = null; it.choice = null; it.guessed = false; it.missing = null; it.variant = null; it.manualPick = false; await engine.prepare(it); }
    renderItem(it);
    await engine.makeAudio(it);
    renderItem(it);
    for (const [key] of SPEEDS.slice().reverse()) await engine.verify([it], key);
  } catch (e) { console.error(e); showErr("다시 만들지 못했어요: " + (e.message || e)); }
  finally { busy = false; setBusy(false); renderItem(it); updateSummary(); clearDone(); }
}

// ---------- 확인표 ----------
const state = it => it.override ? "ok" : itemState(it);

function renderList() {
  $("list").replaceChildren(...items.map((it, i) => { it.el = h("li", { class: "item" }); it.no = i + 1; return it.el; }));
  items.forEach(renderItem);
}

function renderItem(it) {
  if (!it.el) return;
  const st = state(it);
  const view = h("div", { class: "view" },
    h("div", { class: "w", lang: "en" }, it.word),
    h("div", { class: "m" }, it.meaning || "(뜻 없음)"),
    h("button", { class: "btn quiet small edit", type: "button", onclick: () => { it.el.classList.add("editing"); it.el.querySelector(".ew").focus(); } }, "고치기"));
  const ew = h("input", { class: "ew", value: it.word, "aria-label": "영어 단어" });
  const em = h("input", { class: "em", value: it.meaning, "aria-label": "뜻" });
  const editbox = h("div", { class: "editbox" }, ew, em, h("div", {},
    h("button", { class: "btn small", type: "button", onclick: () => {
      const w = ew.value.trim().replace(/\s+/g, " "), m = em.value.trim();
      if (!/^[A-Za-z][A-Za-z' .\-]*$/.test(w)) { ew.focus(); return; }
      const changedWord = w !== it.word; it.word = w; it.meaning = m;
      syncTextarea();
      it.el.classList.remove("editing");
      if (changedWord) regen(it, { reprepare: true });
      else { if (it.variants && it.guessed) { it.choice = null; regen(it, { reprepare: true }); } else renderItem(it); }
    } }, "바꾸기"),
    h("button", { class: "btn quiet small", type: "button", onclick: () => { it.el.classList.remove("editing"); renderItem(it); } }, "취소")));

  // 발음
  const pron = h("div", { class: "pron" });
  if (it.variants) {
    pron.append(h("div", { class: "choices", role: "group", "aria-label": "발음 고르기" }, it.variants.map((v, vi) =>
      h("span", { class: "choice", "aria-pressed": String(vi === it.choice) },
        h("button", { class: "sel", type: "button", "aria-pressed": String(vi === it.choice),
          onclick: () => { if (busy || vi === it.choice) return; it.choice = vi; it.guessed = false; it.ps = v.ps; regen(it); } },
          `${v.label} ${displayIpa(v.ps)}`),
        h("button", { class: "pv playbtn", type: "button", "aria-label": `${v.label} 발음 미리 듣기`, onclick: () => previewVariant(it, v) }, "▶")))));
  } else if (it.ps) {
    pron.append(h("div", { class: "ipa" }, displayIpa(it.ps)));
  }
  const chips = h("div", { class: "chips" });
  if (st === "pending") chips.append(h("span", { class: "chip wait" }, it.audio ? "확인 중…" : "만드는 중…"));
  else if (st === "ok") chips.append(h("span", { class: "chip ok" }, it.override ? "✓ 직접 확인함" : "✓ 확인됨"));
  else chips.append(h("span", { class: "chip warn" }, "직접 들어 보세요"));
  if (it.source === "espeak") chips.append(h("span", { class: "chip bad" }, "사전에 없는 단어"));
  const altWord = !!(it.variants && it.variants.some(v => v.alt));  // 뜻은 같고 발음만 두 가지 (o'clock)
  if (it.variants && it.guessed && !altWord) chips.append(h("span", { class: "chip info" }, "뜻을 보고 발음을 골랐어요"));
  if (altWord) chips.append(h("span", { class: "chip info" }, "발음을 고를 수 있어요"));
  if (it.audio && it.variantUsed && it.variantUsed !== "plain") chips.append(h("span", { class: "chip info" }, it.manualPick ? `고른 소리 (소리 ${VARIANTS.findIndex(v => v.id === it.variantUsed) + 1})` : it.autoFixed ? "소리를 자동으로 고쳤어요" : "예전에 고른 소리"));
  pron.append(chips);

  const notes = [];
  if (it.source === "espeak") notes.push(h("div", { class: "note" }, "철자가 맞는지 확인해 주세요. 맞으면 그대로 두셔도 돼요."));
  if (altWord) notes.push(h("div", { class: "note" }, `사전 발음이 기본이에요. 또박또박 들려주려면 “${it.variants[1].label}”을 눌러 주세요.`));
  else if (it.variants && it.guessed) notes.push(h("div", { class: "note" }, "뜻에 따라 발음이 달라지는 단어예요. 다르면 다른 발음을 눌러 주세요."));
  if (it.check && it.check.normal && it.check.normal.ok && it.check.normal.heard && plain(it.check.normal.heard) !== plain(it.word)) {
    notes.push(h("div", { class: "note" }, "음성인식이 ", h("b", {}, `“${it.check.normal.heard}”`), "로 받아적었어요 (같은 소리)."));
  }
  if (st === "warn") {
    const bad = SPEEDS.map(([k]) => k).reverse().filter(k => !it.check[k].ok);
    const heardTxt = k => it.check[k].heard ? `“${it.check[k].heard}”(으)로 들었어요` : "알아듣지 못했어요";
    notes.push(h("div", { class: "note" }, "음성인식이 ", bad.map(k => (SPEEDS.length > 1 ? SPEED_KO[k] + ": " : "") + heardTxt(k)).join(" · "), "."));
    notes.push(h("div", { class: "chips" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => { it.override = true; renderItem(it); updateSummary(); } }, "들어 보니 괜찮아요"),
      h("button", { class: "btn small quiet", type: "button", onclick: () => { it.pickerOpen = true; renderItem(it); } }, "다른 소리 고르기")));
  }
  pron.append(...notes);
  if (it.pickerOpen && it.audio) pron.append(picker(it));

  const play = h("div", { class: "play" }, SPEEDS.map(([k]) => k).reverse().map(k =>
    h("button", { class: "playbtn", type: "button", disabled: !it.audio, "data-k": k, "aria-label": `${it.word} 듣기`, onclick: e => playAudio(it.audio && it.audio[k], e.currentTarget) }, SPEEDS.length > 1 ? `▶ ${SPEED_KO[k]}` : "▶ 듣기")),
    st !== "warn" && it.audio && !it.pickerOpen ? h("button", { class: "btn quiet small", type: "button", onclick: () => { it.pickerOpen = true; renderItem(it); } }, "다른 소리") : null);

  it.el.replaceChildren(h("div", { class: "no" }, it.no), h("div", {}, view, editbox), pron, play);
  if (busy) it.el.querySelectorAll("button:not(.playbtn)").forEach(b => b.disabled = true);
}

// '다른 소리 고르기': 같은 발음을 6가지로 조금씩 다르게 읽어 보고 가장 자연스러운 것을 고른다.
function picker(it) {
  it.vprev = it.vprev || {};
  const box = h("div", { class: "picker" },
    h("div", { class: "note" }, "들어 보고 가장 자연스러운 소리를 골라 주세요. 고른 소리는 올릴 때 저장돼서 다음에도 이 단어에 쓰여요."));
  const row = h("div", { class: "choices" });
  VARIANTS.forEach((v, vi) => {
    const cur = v.id === it.variantUsed;
    const pv = h("button", { class: "pv playbtn", type: "button", "aria-label": `소리 ${vi + 1} 듣기`, onclick: async e => {
      const b = e.currentTarget;
      if (cur) return playAudio(it.audio.normal, b);
      if (!it.vprev[v.id]) { b.textContent = "…"; it.vprev[v.id] = A.finish(await engine.variantAudio(it.ps, v.id)); b.textContent = "▶"; }
      playAudio(it.vprev[v.id], b);
    } }, "▶");
    const sel = h("button", { class: "sel", type: "button", "aria-pressed": String(cur), disabled: cur, onclick: () => {
      it.variant = v.id; it.manualPick = true; it.pickerOpen = false; regen(it);
    } }, cur ? `소리 ${vi + 1} (지금)` : `소리 ${vi + 1} 쓰기`);
    row.append(h("span", { class: "choice", "aria-pressed": String(cur) }, pv, sel));
  });
  box.append(row, h("button", { class: "btn quiet small", type: "button", onclick: () => { it.pickerOpen = false; renderItem(it); } }, "닫기"));
  return box;
}

function syncTextarea() { $("words").value = items.map(it => `${it.word} ${it.meaning}`.trim()).join("\n"); saveDraft(); }

function updateSummary() {
  const n = items.length, ok = items.filter(it => state(it) === "ok").length, warn = items.filter(it => state(it) === "warn").length;
  const pend = n - ok - warn;
  $("sum").replaceChildren("단어 ", h("b", {}, n), "개 · 확인됨 ", h("b", {}, ok),
    ...(warn ? [" · 살펴볼 단어 ", h("b", {}, warn)] : []), ...(pend ? [" · 만드는 중 ", h("b", {}, pend)] : []));
}

// ---------- 소리 ----------
const player = new Audio();
let playingBtn = null;
const wavUrl = a => URL.createObjectURL(new Blob([A.wavBytes(a)], { type: "audio/wav" }));
function playAudio(a, btn) {
  if (!a) return;
  if (playingBtn) playingBtn.classList.remove("on");
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = wavUrl(a); playingBtn = btn; btn && btn.classList.add("on");
  player.play().catch(() => {});
}
player.addEventListener("ended", () => { if (playingBtn) playingBtn.classList.remove("on"); playingBtn = null; });
async function previewVariant(it, v) {
  it.vcache = it.vcache || {};
  if (!it.vcache[v.ps]) it.vcache[v.ps] = A.finish(await engine.synth(v.ps, 1));
  playAudio(it.vcache[v.ps], null);
}

// ---------- 미리 보기 · 올리기 ----------
function encodeSet() {
  if (!window.lamejs) throw new Error("MP3 변환 도구를 불러오지 못했어요. 새로고침해 주세요.");
  return items.map(it => {
    if (!it.mp3) it.mp3 = Object.fromEntries(SPEEDS.map(([k]) => [k, A.toBase64(A.mp3Bytes(it.audio[k], window.lamejs))]));
    return { w: it.word, m: it.meaning, a: { ...it.mp3 } };
  });
}
function currentSet() {
  return { date: $("date").value, title: $("title").value.trim() || autoTitle($("date").value), words: encodeSet() };
}
function ready() {
  if (!items.length || items.some(it => !it.audio || state(it) === "pending")) { showErr("발음을 먼저 만들어 주세요."); return false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test($("date").value)) { showErr("날짜를 골라 주세요."); return false; }
  return true;
}

$("preview").addEventListener("click", async () => {
  if (!ready()) return;
  const c = curClass();
  const r = await pages.buildSetFiles(c, currentSet(), null);
  const url = URL.createObjectURL(new Blob([r.files[r.file]], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) showErr("새 탭이 막혔어요. 브라우저 주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트를 허용해 주세요.");
});

let confirmStep = null;
$("publish").addEventListener("click", () => publish());

async function publish(confirmed = {}) {
  if (busy || !ready()) return;
  if (!gh) { openSettings(); $("tokenStatus").textContent = "올리려면 먼저 GitHub 열쇠를 넣어 주세요."; $("tokenStatus").className = "status bad"; return; }
  const c = curClass(), date = $("date").value;
  const warn = items.filter(it => state(it) === "warn").length;
  if (warn && !confirmed.warn) return askConfirm(`살펴볼 단어가 ${warn}개 있어요. 그래도 올릴까요?`, () => publish({ ...confirmed, warn: true }));
  const title = $("title").value.trim() || autoTitle(date);
  let editingThis = editing && editing.code === c.code && editing.date === date;
  // 불러온 단어장의 제목을 바꿨으면, 그 단어장을 바꿀지 새로 추가할지 묻는다
  // (2026-11-01: Day 6 을 불러온 화면에 Day 7 을 넣어 올렸더니 Day 6 이 사라진 일이 있었음)
  if (editingThis && title !== editing.title && !confirmed.mode) {
    return askChoice(`불러온 “${editing.title}” 단어장의 다음 시험 칸을 “${title}”${ro(title)} 바꿨어요. 어떻게 올릴까요?`, [
      [`“${editing.title}” 그대로 두고 새로 추가`, () => publish({ ...confirmed, mode: "add" })],
      [`“${editing.title}” 대신 바꾸기`, () => publish({ ...confirmed, mode: "replace" }), true]]);
  }
  if (confirmed.mode === "add") editingThis = false;
  // 같은 날짜에 제목이 같은 단어장이 있으면 바꿀지 묻는다 (제목이 다르면 새 단어장으로 추가)
  if (!editingThis && classInfo.code === c.code && classInfo.entries.some(e => e.date === date && e.title === title) && !confirmed.overwrite) {
    return askConfirm(`${c.name}에 ${dayLabel(date)} “${title}” 단어장이 이미 있어요. 새 것으로 바꿀까요? (다른 단어장으로 추가하려면 다음 시험 칸을 바꿔 주세요)`, () => publish({ ...confirmed, overwrite: true }));
  }
  const when = dockSched.get();
  if (when.error) return showErr(when.error);
  if (!editingThis && !confirmed.late && classInfo.code === c.code) {
    const later = laterListAt(classInfo.entries, date, title, when.showFrom);
    if (later) return askConfirm(lateMsg(later, date, when.showFrom), () => publish({ ...confirmed, late: true }));
  }
  busy = true; setBusy(true); $("publish").textContent = "올리는 중…";
  try {
    const set = currentSet();
    if (when.showFrom) set.showFrom = when.showFrom;
    const cur = await gh.getText(`${c.code}.html`);
    const existing = await gh.listRoot();
    const r = await pages.buildSetFiles(c, set, cur, { replaceHref: editingThis ? editing.href : null, getData: href => gh.getText(href), existing });
    const fx = await collectFixes();
    if (fx) r.files["app/fixes.json"] = JSON.stringify(fx, null, 2) + "\n";
    await gh.commit(r.files, `${c.name} ${set.title} ${r.replacing ? "고침" : "올림"} (단어장 앱)`);
    if (fx) engine.fixes = fx;
    setEditing(null); // 올린 뒤에는 새로 시작 (제목을 바꿔 다시 올리면 새 단어장으로 추가, 같은 제목이면 바꿀지 물음)
    // 준비해 둔 단어장을 고쳐서 바로 올렸으면 준비 목록에서는 뺀다
    if (draftEditing) { const id = draftEditing.id; setDraftEditing(null); removeDraftQuietly(id, `${c.name} ${set.title} 올려서 준비 목록에서 뺌 (단어장 앱)`); }
    showDone(c, set, r);
    dockSched.set(null);
    onClassChange();
  } catch (e) {
    console.error(e); showErr("올리지 못했어요: " + (e.message || e));
  } finally { busy = false; setBusy(false); $("publish").textContent = "올리기"; }
}

// 이번 단어장에서 기본과 다른 소리를 쓴 단어를 app/fixes.json 에 기록 (바뀐 게 없으면 null)
async function collectFixes() {
  let base = {};
  try { const t = await gh.getText("app/fixes.json"); if (t) base = JSON.parse(t); } catch (e) { base = { ...engine.fixes }; }
  const fx = { ...base };
  for (const it of items) {
    if (!it.ps || !it.variantUsed) continue;
    if (it.variantUsed !== "plain") fx[it.ps] = it.variantUsed;
    else if (it.manualPick) delete fx[it.ps];
  }
  return JSON.stringify(fx) === JSON.stringify(base) ? null : fx;
}

function askConfirm(msg, yes) { askChoice(msg, [["올리기", yes]]); }
// choices: [[버튼 글자, 누르면 할 일, 덜 눈에 띄게?], ...] + 취소
function askChoice(msg, choices) {
  const box = $("confirm");
  box.replaceChildren(msg,
    ...choices.map(([label, fn, quiet]) => h("button", { class: quiet ? "btn small ghost" : "btn small", type: "button", onclick: () => { box.hidden = true; fn(); } }, label)),
    h("button", { class: "btn small quiet", type: "button", onclick: () => { box.hidden = true; } }, "취소"));
  box.hidden = false;
}

function showDone(c, set, r) {
  const classUrl = SITE + c.code + ".html", dayUrl = SITE + r.file;
  // 카톡 공지 문구 (선생님 지정 문구, 2026-10-30 수정)
  const msg = `다나쌤 다음 단어 시험입니다.\n아래 링크에 접속해서 발음을 들어보며 공부하세요.\n${classUrl}`;
  const card = $("doneCard");
  card.replaceChildren(h("div", { class: "dgrid" },
    h("div", {},
      set.showFrom
        ? h("p", {}, h("b", {}, `${c.name}에 ${r.replacing ? "고쳐서 올렸어요" : "올렸어요"}.`), " ", h("span", { class: "pill2" }, "⏰ 예약"),
            ` ${fmtWhen(set.showFrom)}부터 반 주소 맨 위에 나와요. 그 전까지는 지금 단어장이 그대로 보여요.`)
        : h("p", {}, h("b", {}, `${c.name}에 ${r.replacing ? "고쳐서 올렸어요" : "올렸어요"}.`), " 1~2분 뒤 학생 주소에 나와요.",
            r.sameDayCount > 1 ? ` ${dayLabel(set.date)} 단어장 ${r.sameDayCount}개가 반 주소에 차례로 나와요.` : ""),
      h("div", { class: "copyrow" }, "반 주소 ", h("code", {}, classUrl), copyBtn(classUrl, "주소 복사")),
      h("div", { class: "copyrow" }, "이 단어장만 ", h("code", {}, dayUrl)),
      h("div", { class: "copyrow" }, copyBtn(msg, "카톡 공지 문구 복사"),
        h("button", { class: "btn ghost small", type: "button", onclick: resetForNext }, "다음 단어장 만들기"))),
    qrBox(c, classUrl)));
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}
function copyBtn(text, label) {
  return h("button", { class: "btn small", type: "button", onclick: async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(text); b.textContent = "복사했어요"; }
    catch (err) { b.textContent = "복사 실패 – 직접 선택해 주세요"; }
    setTimeout(() => b.textContent = label, 1800);
  } }, label);
}
function clearDone() { $("doneCard").hidden = true; }
function resetForNext() {
  setEditing(null); setDraftEditing(null); dockSched.set(null);
  items = []; $("list").replaceChildren(); $("resultCard").hidden = true; $("dock").hidden = true; clearDone();
  $("words").value = ""; titleTouched = false; $("title").value = ""; saveDraft();
  window.scrollTo({ top: 0, behavior: "smooth" }); $("words").focus();
}

// ---------- 설정 ----------
const dlg = $("settings");
function openSettings() { $("token").value = ""; dlg.showModal(); }
$("openSettings").addEventListener("click", openSettings);
$("bannerSettings").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", () => dlg.close());

$("saveToken").addEventListener("click", async () => {
  const t = $("token").value.trim(), st = $("tokenStatus");
  if (!t) { st.textContent = "열쇠를 붙여넣어 주세요."; st.className = "status bad"; return; }
  st.textContent = "확인 중…"; st.className = "status";
  const g = new GitHub(t);
  let r; try { r = await g.check(); } catch (e) { r = { ok: false, why: "GitHub에 연결하지 못했어요. 인터넷을 확인해 주세요." }; }
  if (!r.ok) { st.textContent = r.why; st.className = "status bad"; return; }
  gh = g; books = new Books(gh); store.set(LS.token, t); $("tokenBanner").hidden = true; $("token").value = "";
  loadBookIndex(); loadDrafts();
  st.textContent = "연결됐어요. 이제 올리기를 할 수 있어요."; st.className = "status ok";
  loadClasses(); onClassChange();
  if (listenUI) listenUI.start().catch(e => console.error(e));
});
$("clearToken").addEventListener("click", () => {
  gh = null; books = null; bookIdx = null; store.set(LS.token, null); $("tokenBanner").hidden = false;
  renderBookBox(); renderClassList(); drafts = []; renderDrafts();
  if (listenUI) listenUI.start().catch(e => console.error(e));
  $("tokenStatus").textContent = "이 브라우저에서 열쇠를 지웠어요."; $("tokenStatus").className = "status";
});

function renderClassList() {
  $("classList").replaceChildren(...classes.map(c => {
    const li = h("li", {});
    const view = () => li.replaceChildren(
      h("b", {}, c.name), h("code", {}, `${SITE}${c.code}.html`),
      h("span", { class: "acts" },
        h("button", { class: "btn quiet small", type: "button", onclick: edit }, "이름 바꾸기"),
        h("button", { class: "btn quiet small", type: "button", onclick: editCode }, "주소 바꾸기"),
        h("button", { class: "btn quiet small", type: "button", onclick: () => saveQr(c) }, "QR 저장"),
        h("button", { class: "btn quiet small", type: "button", onclick: askRemove }, "목록에서 빼기")),
      bookPicker(c));
    const edit = () => {
      const inp = h("input", { type: "text", value: c.name, "aria-label": `${c.name} 새 이름` });
      li.replaceChildren(inp, h("code", {}, `${SITE}${c.code}.html`), h("span", { class: "acts" },
        h("button", { class: "btn small", type: "button", onclick: () => renameClass(c, inp.value.trim()) }, "바꾸기"),
        h("button", { class: "btn quiet small", type: "button", onclick: view }, "취소")));
      inp.focus(); inp.select();
      inp.addEventListener("keydown", e => { if (e.key === "Enter") renameClass(c, inp.value.trim()); if (e.key === "Escape") view(); });
    };
    const editCode = () => {
      const inp = h("input", { type: "text", value: c.code, "aria-label": `${c.name} 새 주소 코드`, style: "max-width:140px" });
      li.replaceChildren(h("b", {}, c.name),
        h("span", { class: "ask" }, `새 주소: ${SITE}`, inp, ".html  (옛 주소로 들어와도 새 주소로 넘어가요)"),
        h("span", { class: "acts" },
          h("button", { class: "btn small", type: "button", onclick: () => changeCode(c, inp.value.trim().toLowerCase()) }, "바꾸기"),
          h("button", { class: "btn quiet small", type: "button", onclick: view }, "취소")));
      inp.focus(); inp.select();
      inp.addEventListener("keydown", e => { if (e.key === "Enter") changeCode(c, inp.value.trim().toLowerCase()); if (e.key === "Escape") view(); });
    };
    const askRemove = () => li.replaceChildren(
      h("span", { class: "ask" }, `${c.name}을(를) 반 목록에서 뺄까요? 이미 올린 단어장과 공지한 주소는 그대로 열려요.`),
      h("span", { class: "acts" },
        h("button", { class: "btn small", type: "button", onclick: () => removeClass(c) }, "빼기"),
        h("button", { class: "btn quiet small", type: "button", onclick: view }, "취소")));
    view();
    return li;
  }));
}

function classMsg(msg, ok, extra) {
  const st = $("classStatus");
  st.replaceChildren(msg, ...(extra ? [" ", extra] : []));
  st.className = "status " + (ok === true ? "ok" : ok === false ? "bad" : "");
}

// 반 이름 바꾸기: 주소(코드)는 그대로, 반 목록·첫 화면·그 반의 모든 단어장 페이지 이름을 바꾼다.
async function renameClass(c, newName) {
  if (!gh) return classMsg("이름을 바꾸려면 먼저 위에서 GitHub 열쇠를 넣어 주세요.", false);
  if (!newName) return classMsg("새 이름을 적어 주세요.", false);
  if (newName === c.name) return renderClassList();
  if (classes.some(x => x.name === newName && x.code !== c.code)) return classMsg("이미 있는 반 이름이에요.", false);
  classMsg(`${c.name} → ${newName} 바꾸는 중…`);
  try {
    const reg = JSON.parse(await gh.getText("classes.json"));
    const target = reg.classes.find(x => x.code === c.code);
    if (!target) throw new Error("반 목록에서 이 반을 찾지 못했어요. 새로고침해 주세요.");
    const oldName = target.name; target.name = newName;
    const files = { "classes.json": JSON.stringify(reg, null, 2) + "\n", "index.html": pages.rootIndex(reg.classes) };
    const re = datedRe(c.code);
    for (const name of (await gh.listRoot()).filter(n => re.test(n))) {
      const d = readData(await gh.getText(name)); if (!d) continue;
      d.cls = newName;
      files[name] = pages.studentPage(d, { title: `${newName} ${d.title}`, desc: `단어를 누르면 발음이 나와요 · 단어 ${d.words.length}개`, url: SITE + name });
    }
    const cd = readData(await gh.getText(`${c.code}.html`));
    files[`${c.code}.html`] = cd && cd.cls_code === c.code
      ? pages.classPage(target, cd.date, setsOf(cd, c.code), (cd.past || []).map(p => ({ date: (p.href.match(/\d{4}-\d{2}-\d{2}/) || [""])[0], ...p })))
      : pages.emptyClassPage(target);
    await gh.commit(files, `반 이름 바꿈: ${oldName} → ${newName} (단어장 앱)`);
    await loadClasses(); onClassChange();
    classMsg(`${newName}(으)로 바꿨어요. 1~2분 뒤 학생 페이지에도 반영돼요. 주소는 그대로예요.`, true,
      h("button", { class: "btn small", type: "button", onclick: () => saveQr(target) }, "새 이름으로 QR 저장"));
  } catch (e) { console.error(e); classMsg("이름을 바꾸지 못했어요: " + (e.message || e), false); }
}

// 주소 바꾸기: 그 반 페이지와 지금까지 올린 단어장을 새 주소로 옮기고, 옛 주소에는 새 주소로 넘겨 주는 안내 페이지를 남긴다.
async function changeCode(c, code) {
  if (!gh) return classMsg("주소를 바꾸려면 먼저 위에서 GitHub 열쇠를 넣어 주세요.", false);
  if (code === c.code) return renderClassList();
  if (!/^[a-z0-9]{2,12}$/.test(code)) return classMsg("주소 코드는 영어 소문자와 숫자 2~12자로 적어 주세요. (예: m1a)", false);
  if (classes.some(x => x.code === code)) return classMsg("다른 반이 이미 쓰고 있는 주소예요.", false);
  classMsg(`${c.name} 주소를 ${code}.html 로 옮기는 중…`);
  try {
    const all = await gh.listRoot();
    // 새 주소 자리에 파일이 있으면: 이 반이 예전에 쓰던 주소(지금 이 반으로 넘겨 주는 안내 페이지)일 때만 다시 쓸 수 있다.
    // 다른 반으로 넘겨 주는 주소를 가져오면 그 반 학생들의 옛 링크가 엉뚱한 반으로 열리기 때문.
    const pointsHere = html => !!html && new RegExp(`name="wp-redirect" content="${c.code}[.-]`).test(html);
    const clash = all.filter(n => n === `${code}.html` || datedRe(code).test(n));
    for (const n of clash) if (!pointsHere(await gh.getText(n))) return classMsg(`${code}.html 은(는) 이미 쓰였거나 예전에 다른 반이 쓰던 주소예요. 옛 링크가 헷갈리지 않도록 다른 코드를 골라 주세요.`, false);

    const reg = JSON.parse(await gh.getText("classes.json"));
    const target = reg.classes.find(x => x.code === c.code);
    if (!target) throw new Error("반 목록에서 이 반을 찾지 못했어요. 새로고침해 주세요.");
    const oldCode = target.code; target.code = code;
    const files = { "classes.json": JSON.stringify(reg, null, 2) + "\n", "index.html": pages.rootIndex(reg.classes) };
    const re = datedRe(oldCode);
    const moved = [];
    const renamed = href => href.replace(new RegExp(`^${oldCode}-`), `${code}-`);
    for (const name of all.filter(n => re.test(n))) {
      const html = await gh.getText(name), d = readData(html);
      if (!d) continue; // 이미 안내 페이지
      const nn = renamed(name);
      d.cls_code = code; d.home = `${code}.html`;
      files[nn] = pages.studentPage(d, { title: `${target.name} ${d.title}`, desc: `단어를 누르면 발음이 나와요 · 단어 ${d.words.length}개`, url: SITE + nn });
      files[name] = pages.redirectPage(nn);
      moved.push(nn);
    }
    const cd = readData(await gh.getText(`${oldCode}.html`));
    if (cd && cd.cls_code === oldCode) {
      const sets = setsOf(cd, oldCode).map(st => ({ ...st, href: renamed(st.href) }));
      const past = (cd.past || []).map(p => ({ date: (p.href.match(/\d{4}-\d{2}-\d{2}/) || [""])[0], ...p, href: renamed(p.href) }));
      files[`${code}.html`] = pages.classPage(target, cd.date, sets, past);
    } else {
      files[`${code}.html`] = pages.emptyClassPage(target);
    }
    files[`${oldCode}.html`] = pages.redirectPage(`${code}.html`);
    await gh.commit(files, `${target.name} 주소 바꿈: ${oldCode}.html → ${code}.html (단어장 앱)`);
    const wasSelected = $("cls").value === oldCode;
    await loadClasses();
    if (wasSelected) $("cls").value = code;
    saveDraft(); onClassChange();
    classMsg(`${target.name} 주소를 바꿨어요: ${SITE}${code}.html (1~2분 뒤 열려요). 옛 주소와 옛 QR로 들어와도 새 주소로 넘어가요. 앞으로는 새 QR을 공지해 주세요.`, true,
      h("button", { class: "btn small", type: "button", onclick: () => saveQr(target) }, "새 주소 QR 저장"));
  } catch (e) { console.error(e); classMsg("주소를 바꾸지 못했어요: " + (e.message || e), false); }
}

// 반 목록에서 빼기: 반 목록과 첫 화면에서만 뺀다 (페이지는 지우지 않아 예전 주소도 계속 열림).
async function removeClass(c) {
  if (!gh) return classMsg("반을 빼려면 먼저 위에서 GitHub 열쇠를 넣어 주세요.", false);
  classMsg(`${c.name} 빼는 중…`);
  try {
    const reg = JSON.parse(await gh.getText("classes.json"));
    reg.classes = reg.classes.filter(x => x.code !== c.code);
    await gh.commit({ "classes.json": JSON.stringify(reg, null, 2) + "\n", "index.html": pages.rootIndex(reg.classes) }, `${c.name} 반 목록에서 뺌 (단어장 앱)`);
    await loadClasses(); onClassChange();
    classMsg(`${c.name}을(를) 반 목록에서 뺐어요. 같은 이름으로 다시 추가하려면 아래 '반 추가'에서 주소 코드 ${c.code} 로 추가하면 예전 단어장이 다시 이어져요.`, true);
  } catch (e) { console.error(e); classMsg("반을 빼지 못했어요: " + (e.message || e), false); }
}

$("newName").addEventListener("input", () => {
  const m = /^\s*(초|중|고)\s*(\d)\s*([A-Za-z])?\s*반?\s*$/.exec($("newName").value);
  if (m) $("newCode").value = ({ 초: "e", 중: "m", 고: "h" })[m[1]] + m[2] + (m[3] || "").toLowerCase();
});

$("addClass").addEventListener("click", async () => {
  const st = $("classStatus"), name = $("newName").value.trim(), code = $("newCode").value.trim().toLowerCase();
  const bad = msg => { st.textContent = msg; st.className = "status bad"; };
  if (!gh) return bad("반을 추가하려면 먼저 위에서 GitHub 열쇠를 넣어 주세요.");
  if (!name) return bad("반 이름을 적어 주세요.");
  if (!/^[a-z0-9]{2,12}$/.test(code)) return bad("주소 코드는 영어 소문자와 숫자 2~12자로 적어 주세요.");
  if (classes.some(c => c.code === code)) return bad("이미 있는 주소 코드예요.");
  if (classes.some(c => c.name === name)) return bad("이미 있는 반 이름이에요.");
  st.textContent = "올리는 중…"; st.className = "status";
  try {
    const raw = await gh.getText("classes.json");
    const reg = raw ? JSON.parse(raw) : { site: SITE, classes: [] };
    if (reg.classes.some(c => c.code === code)) return bad("이미 있는 주소 코드예요.");
    const nc = { code, name };
    reg.classes.push(nc);
    const files = { "classes.json": JSON.stringify(reg, null, 2) + "\n", "index.html": pages.rootIndex(reg.classes) };
    const existingHtml = await gh.getText(`${code}.html`);
    if (existingHtml && existingHtml.includes('name="wp-redirect"')) return bad(`${code} 는 예전에 다른 반이 쓰던 주소예요 (지금은 그 반 새 주소로 넘겨 주는 중). 다른 코드를 골라 주세요.`);
    const existing = readData(existingHtml);
    // 예전에 빼 둔 반을 같은 코드로 다시 추가하면 그 반 단어장을 그대로 잇는다 (이름만 새로)
    files[`${code}.html`] = existing && existing.cls_code === code
      ? pages.classPage(nc, existing.date, setsOf(existing, code), existing.past || [])
      : pages.emptyClassPage(nc);
    await gh.commit(files, `${name} 반 추가 (단어장 앱)`);
    classes = reg.classes;
    await loadClasses();
    st.replaceChildren(`${name}을(를) 추가했어요. 1~2분 뒤 열려요: `, h("code", {}, `${SITE}${code}.html`), " ",
      h("button", { class: "btn small", type: "button", onclick: () => saveQr(nc) }, "QR 저장"));
    st.className = "status ok";
    $("newName").value = ""; $("newCode").value = "";
  } catch (e) { bad("반을 추가하지 못했어요: " + (e.message || e)); }
});

// QR 이미지 (Python make_qr.py 와 같은 모양)
// 반 주소 QR (올린 뒤 카드 오른쪽): 화면에 작게 보여 주고, 저장은 반 이름이 들어간 큰 그림으로 (설정의 QR 저장과 같은 그림)
function qrBox(c, url) {
  if (!window.qrcode) return null;
  const qr = window.qrcode(0, "M"); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), quiet = 2, css = 132, dpr = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const cv = h("canvas", { width: css * dpr, height: css * dpr, role: "img", "aria-label": `${c.name} 반 주소 QR코드` });
  const g = cv.getContext("2d"), cell = (css * dpr) / (n + 2 * quiet);
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(Math.floor((col + quiet) * cell), Math.floor((r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  return h("figure", { class: "qrbox" }, cv,
    h("figcaption", {}, `${c.name} 반 주소 QR`),
    h("button", { class: "btn small", type: "button", onclick: () => saveQr(c) }, "QR 저장"));
}

async function saveQr(c) {
  if (!window.qrcode) return;
  try { await document.fonts.load('700 64px "IBM Plex Sans KR"'); await document.fonts.load('400 38px "IBM Plex Sans KR"'); } catch (e) {}
  const url = `${SITE}${c.code}.html`, title = `${BRAND} · ${c.name}`;
  const qr = window.qrcode(0, "M"); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), quiet = 2, size = 760, cell = size / (n + 2 * quiet);
  const W = 1080, H = 200 + size + 140, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.font = '700 64px "IBM Plex Sans KR", sans-serif'; g.textBaseline = "top";
  const tw = g.measureText(title).width, tx = (W - tw) / 2;
  g.fillStyle = "#FFE14D"; g.fillRect(tx - 8, 120, tw + 16, 36);
  g.fillStyle = "#15213B"; g.fillText(title, tx, 70);
  const ox = (W - size) / 2, oy = 200;
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(Math.floor(ox + (col + quiet) * cell), Math.floor(oy + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  g.font = '400 38px "IBM Plex Sans KR", sans-serif'; g.fillStyle = "#56637F";
  const sub = "휴대폰 카메라로 찍으면 단어장이 열려요", sw = g.measureText(sub).width;
  g.fillText(sub, (W - sw) / 2, oy + size + 50);
  cv.toBlob(b => { const a = h("a", { href: URL.createObjectURL(b), download: `${c.name}-QR.png` }); document.body.append(a); a.click(); a.remove(); });
}
