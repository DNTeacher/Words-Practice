// 단어장 만들기 화면
import { Engine, SPEEDS, itemState, plain } from "./engine.js?v=3";
import { Pages, GitHub, SITE, readData } from "./site.js?v=3";
import { displayIpa } from "./g2p.js?v=3";
import * as A from "./audio.js?v=3";

const $ = id => document.getElementById(id);
const SPEED_KO = { normal: "보통", slow: "천천히", very_slow: "아주 천천히" };
const LS = { token: "wp-gh-token", draft: "wp-draft" };
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

// ---------- 시작 ----------
init().catch(e => console.error(e));

async function init() {
  const tok = store.get(LS.token);
  if (tok) gh = new GitHub(tok);
  $("tokenBanner").hidden = !!gh;

  await loadClasses();
  restoreDraft();
  if (!$("date").value) $("date").value = today();
  if (!titleTouched) $("title").value = autoTitle($("date").value);
  onClassChange();

  pages.load().catch(e => showErr("페이지 틀을 불러오지 못했어요: " + e.message));
  setEngine("발음 사전 불러오는 중", 0.02);
  try {
    await engine.loadDict("app/dict-us.json?v=3");
    await engine.loadModels((p, txt) => setEngine(`AI 준비 중 · ${txt}`, 0.05 + 0.95 * p));
    engineReady = true;
    setEngine(engine.device === "webgpu" ? "AI 준비됨 (그래픽 가속)" : "AI 준비됨", 1, "ready");
    $("make").disabled = false;
    $("makeNote").textContent = "처음 만들 때는 1~2분쯤 걸려요.";
  } catch (e) {
    console.error(e);
    setEngine("AI를 불러오지 못했어요", 0, "err");
    $("makeNote").textContent = "인터넷 연결을 확인하고 새로고침해 주세요. (" + (e.message || e) + ")";
  }
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
}
const curClass = () => classes.find(c => c.code === $("cls").value);

async function onClassChange() {
  const c = curClass(); if (!c) return;
  classInfo = { code: c.code, entries: [] };
  $("prevBox").hidden = true;
  let html = null;
  try { html = gh ? await gh.getText(`${c.code}.html`) : await (await fetch(`${c.code}.html`, { cache: "no-cache" })).text(); } catch (e) {}
  if (classInfo.code !== c.code) return;
  const d = readData(html);
  if (d && d.cls_code === c.code) {
    classInfo.entries = [{ href: `${c.code}-${d.date}.html`, title: d.title, date: d.date }, ...(d.past || []).map(p => ({ ...p, date: (p.href.match(/\d{4}-\d{2}-\d{2}/) || [""])[0] }))];
  }
  if (classInfo.entries.length) {
    $("prevSel").replaceChildren(...classInfo.entries.map(e => h("option", { value: e.href }, e.title)));
    $("prevBox").hidden = false;
  }
}

$("cls").addEventListener("change", () => { saveDraft(); onClassChange(); clearDone(); });
$("date").addEventListener("change", () => { if (!titleTouched) $("title").value = autoTitle($("date").value); saveDraft(); clearDone(); });
$("title").addEventListener("input", () => { titleTouched = true; saveDraft(); });
$("words").addEventListener("input", saveDraft);

$("prevLoad").addEventListener("click", async () => {
  const href = $("prevSel").value; if (!href) return;
  try {
    const html = gh ? await gh.getText(href) : await (await fetch(href, { cache: "no-cache" })).text();
    const d = readData(html); if (!d) throw new Error("단어장을 읽지 못했어요");
    $("date").value = d.date; $("title").value = d.title; titleTouched = true;
    $("words").value = d.words.map(w => `${w.w} ${w.m}`).join("\n");
    saveDraft(); clearDone();
    $("words").focus();
  } catch (e) { showErr(e.message); }
});

// ---------- 임시 저장 ----------
function saveDraft() {
  store.set(LS.draft, JSON.stringify({ cls: $("cls").value, date: $("date").value, title: $("title").value, titleTouched, text: $("words").value }));
}
function restoreDraft() {
  try {
    const d = JSON.parse(store.get(LS.draft) || "null"); if (!d) return;
    if (d.cls && classes.some(c => c.code === d.cls)) $("cls").value = d.cls;
    if (d.date) $("date").value = d.date;
    titleTouched = !!d.titleTouched; if (d.title) $("title").value = d.title;
    if (d.text) $("words").value = d.text;
  } catch (e) {}
}

// ---------- 단어 읽기 ----------
function parse(text) {
  const out = [], errs = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.replace(/ /g, " ").trim();
    if (!line) return;
    line = line.replace(/^(\d+\s*[.)]|[-•·*▪︎])\s*/, "").replace(/[’‘]/g, "'");
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
  items = parsed;
  try {
    for (const it of items) await engine.prepare(it);
    const none = items.filter(it => !it.ps);
    if (none.length) { showErr(`발음을 만들 수 없는 단어가 있어요: ${none.map(it => it.word).join(", ")}. 철자를 확인해 주세요.`); return; }
    $("resultCard").hidden = false; $("dock").hidden = false;
    renderList(); updateSummary();
    const n = items.length, verifySteps = n * 3;
    let step = 0;
    const tick = (label) => { step++; setProg(label, step / (n + verifySteps)); };
    for (const it of items) { await engine.makeAudio(it); renderItem(it); tick(`음성 만드는 중 ${items.indexOf(it) + 1}/${n}`); }
    for (const [key] of [["normal"], ["slow"], ["very_slow"]]) {
      await engine.verify(items, key, () => tick(`음성인식으로 확인 중 (${SPEED_KO[key]})`));
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
  $("publish").disabled = on; $("preview").disabled = on;
  document.querySelectorAll(".item button").forEach(b => { if (!b.classList.contains("playbtn")) b.disabled = on; });
}

// 단어 하나만 다시 만들기
async function regen(it, { reprepare = false } = {}) {
  if (busy) return;
  busy = true; setBusy(true);
  try {
    it.audio = null; it.check = null; it.mp3 = null; it.override = false;
    if (reprepare) { it.variants = null; it.choice = null; it.guessed = false; it.missing = null; await engine.prepare(it); }
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
  if (it.variants && it.guessed) chips.append(h("span", { class: "chip info" }, "뜻을 보고 발음을 골랐어요"));
  pron.append(chips);

  const notes = [];
  if (it.source === "espeak") notes.push(h("div", { class: "note" }, "철자가 맞는지 확인해 주세요. 맞으면 그대로 두셔도 돼요."));
  if (it.variants && it.guessed) notes.push(h("div", { class: "note" }, "뜻에 따라 발음이 달라지는 단어예요. 다르면 다른 발음을 눌러 주세요."));
  if (it.check && it.check.normal && it.check.normal.ok && it.check.normal.heard && plain(it.check.normal.heard) !== plain(it.word)) {
    notes.push(h("div", { class: "note" }, "음성인식이 ", h("b", {}, `“${it.check.normal.heard}”`), "로 받아적었어요 (같은 소리)."));
  }
  if (st === "warn") {
    const bad = ["normal", "slow", "very_slow"].filter(k => !it.check[k].ok);
    notes.push(h("div", { class: "note" }, bad.map(k => `${SPEED_KO[k]}: “${it.check[k].heard || "알아듣지 못함"}”`).join(" · "), " (으)로 들렸어요."));
    notes.push(h("div", { class: "chips" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => { it.override = true; renderItem(it); updateSummary(); } }, "들어 보니 괜찮아요"),
      h("button", { class: "btn small quiet", type: "button", onclick: () => { it.baseSpeed = it.baseSpeed === 0.92 ? 1.06 : 0.92; regen(it); } }, "다시 만들기")));
  }
  pron.append(...notes);

  const play = h("div", { class: "play" }, ["normal", "slow", "very_slow"].map(k =>
    h("button", { class: "playbtn", type: "button", disabled: !it.audio, "data-k": k, "aria-label": `${it.word} ${SPEED_KO[k]} 듣기`, onclick: e => playAudio(it.audio && it.audio[k], e.currentTarget) }, `▶ ${SPEED_KO[k]}`)));

  it.el.replaceChildren(h("div", { class: "no" }, it.no), h("div", {}, view, editbox), pron, play);
  if (busy) it.el.querySelectorAll("button:not(.playbtn)").forEach(b => b.disabled = true);
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
    return { w: it.word, m: it.meaning, a: { very_slow: it.mp3.very_slow, slow: it.mp3.slow, normal: it.mp3.normal } };
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

$("preview").addEventListener("click", () => {
  if (!ready()) return;
  const c = curClass();
  const files = pages.buildSetFiles(c, currentSet(), null);
  const url = URL.createObjectURL(new Blob([files[files._file]], { type: "text/html" }));
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
  if (classInfo.code === c.code && classInfo.entries.some(e => e.date === date) && !confirmed.overwrite) {
    return askConfirm(`${c.name}에 이미 ${autoTitle(date).replace(" 영어 단어", "")} 단어장이 있어요. 새 것으로 바꿀까요?`, () => publish({ ...confirmed, overwrite: true }));
  }
  busy = true; setBusy(true); $("publish").textContent = "올리는 중…";
  try {
    const set = currentSet();
    const cur = await gh.getText(`${c.code}.html`);
    const files = pages.buildSetFiles(c, set, cur);
    const file = files._file; delete files._file;
    await gh.commit(files, `${c.name} ${set.title} 올림 (단어장 앱)`);
    showDone(c, set, file);
    onClassChange();
  } catch (e) {
    console.error(e); showErr("올리지 못했어요: " + (e.message || e));
  } finally { busy = false; setBusy(false); $("publish").textContent = "올리기"; }
}

function askConfirm(msg, yes) {
  const box = $("confirm");
  box.replaceChildren(msg,
    h("button", { class: "btn small", type: "button", onclick: () => { box.hidden = true; yes(); } }, "올리기"),
    h("button", { class: "btn small quiet", type: "button", onclick: () => { box.hidden = true; } }, "취소"));
  box.hidden = false;
}

function showDone(c, set, file) {
  const classUrl = SITE + c.code + ".html", dayUrl = SITE + file;
  // 카톡 공지 문구 (선생님 지정 문구, 2026-10-29)
  const msg = `다음 단어 시험입니다.\n링크에 접속해서 발음을 들어보며 공부하세요.\n${classUrl}`;
  const card = $("doneCard");
  card.replaceChildren(
    h("p", {}, h("b", {}, `${c.name}에 올렸어요.`), " 1~2분 뒤 학생 주소에 나와요."),
    h("div", { class: "copyrow" }, "반 주소 ", h("code", {}, classUrl), copyBtn(classUrl, "주소 복사")),
    h("div", { class: "copyrow" }, "오늘 단어장 ", h("code", {}, dayUrl)),
    h("div", { class: "copyrow" }, copyBtn(msg, "카톡 공지 문구 복사"),
      h("button", { class: "btn ghost small", type: "button", onclick: resetForNext }, "다음 단어장 만들기")));
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
  items = []; $("list").replaceChildren(); $("resultCard").hidden = true; $("dock").hidden = true; clearDone();
  $("words").value = ""; titleTouched = false; $("title").value = autoTitle($("date").value); saveDraft();
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
  gh = g; store.set(LS.token, t); $("tokenBanner").hidden = true; $("token").value = "";
  st.textContent = "연결됐어요. 이제 올리기를 할 수 있어요."; st.className = "status ok";
  loadClasses(); onClassChange();
});
$("clearToken").addEventListener("click", () => {
  gh = null; store.set(LS.token, null); $("tokenBanner").hidden = false;
  $("tokenStatus").textContent = "이 브라우저에서 열쇠를 지웠어요."; $("tokenStatus").className = "status";
});

function renderClassList() {
  $("classList").replaceChildren(...classes.map(c => h("li", {},
    h("b", {}, c.name), h("code", {}, `${SITE}${c.code}.html`),
    h("button", { class: "btn quiet small", type: "button", onclick: () => saveQr(c) }, "QR 저장"))));
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
    await gh.commit({
      "classes.json": JSON.stringify(reg, null, 2) + "\n",
      "index.html": pages.rootIndex(reg.classes),
      [`${code}.html`]: pages.emptyClassPage(nc),
    }, `${name} 반 추가 (단어장 앱)`);
    classes = reg.classes;
    await loadClasses();
    st.replaceChildren(`${name}을(를) 추가했어요. 1~2분 뒤 열려요: `, h("code", {}, `${SITE}${code}.html`), " ",
      h("button", { class: "btn small", type: "button", onclick: () => saveQr(nc) }, "QR 저장"));
    st.className = "status ok";
    $("newName").value = ""; $("newCode").value = "";
  } catch (e) { bad("반을 추가하지 못했어요: " + (e.message || e)); }
});

// QR 이미지 (Python make_qr.py 와 같은 모양)
async function saveQr(c) {
  if (!window.qrcode) return;
  try { await document.fonts.load('700 64px "IBM Plex Sans KR"'); await document.fonts.load('400 38px "IBM Plex Sans KR"'); } catch (e) {}
  const url = `${SITE}${c.code}.html`, title = `${c.name} 영어 단어장`;
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
