// 단어장 만들기 화면
import { Engine, SPEEDS, itemState, plain } from "./engine.js?v=7";
import { Pages, GitHub, SITE, readData } from "./site.js?v=7";
import { displayIpa } from "./g2p.js?v=7";
import * as A from "./audio.js?v=7";

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
    await engine.loadDict("app/dict-us.json?v=7");
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
    const bad = SPEEDS.map(([k]) => k).reverse().filter(k => !it.check[k].ok);
    const heardTxt = k => it.check[k].heard ? `“${it.check[k].heard}”(으)로 들었어요` : "알아듣지 못했어요";
    notes.push(h("div", { class: "note" }, "음성인식이 ", bad.map(k => (SPEEDS.length > 1 ? SPEED_KO[k] + ": " : "") + heardTxt(k)).join(" · "), "."));
    notes.push(h("div", { class: "chips" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => { it.override = true; renderItem(it); updateSummary(); } }, "들어 보니 괜찮아요"),
      h("button", { class: "btn small quiet", type: "button", onclick: () => { it.baseSpeed = it.baseSpeed === 0.92 ? 1.06 : 0.92; regen(it); } }, "다시 만들기")));
  }
  pron.append(...notes);

  const play = h("div", { class: "play" }, SPEEDS.map(([k]) => k).reverse().map(k =>
    h("button", { class: "playbtn", type: "button", disabled: !it.audio, "data-k": k, "aria-label": `${it.word} 듣기`, onclick: e => playAudio(it.audio && it.audio[k], e.currentTarget) }, SPEEDS.length > 1 ? `▶ ${SPEED_KO[k]}` : "▶ 듣기")));

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
  $("classList").replaceChildren(...classes.map(c => {
    const li = h("li", {});
    const view = () => li.replaceChildren(
      h("b", {}, c.name), h("code", {}, `${SITE}${c.code}.html`),
      h("span", { class: "acts" },
        h("button", { class: "btn quiet small", type: "button", onclick: edit }, "이름 바꾸기"),
        h("button", { class: "btn quiet small", type: "button", onclick: editCode }, "주소 바꾸기"),
        h("button", { class: "btn quiet small", type: "button", onclick: () => saveQr(c) }, "QR 저장"),
        h("button", { class: "btn quiet small", type: "button", onclick: askRemove }, "목록에서 빼기")));
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
    const re = new RegExp(`^${c.code}-\\d{4}-\\d{2}-\\d{2}\\.html$`);
    for (const name of (await gh.listRoot()).filter(n => re.test(n))) {
      const d = readData(await gh.getText(name)); if (!d) continue;
      d.cls = newName;
      files[name] = pages.studentPage(d, { title: `${newName} ${d.title}`, desc: `단어를 누르면 발음이 나와요 · 단어 ${d.words.length}개`, url: SITE + name });
    }
    const cd = readData(await gh.getText(`${c.code}.html`));
    files[`${c.code}.html`] = cd && cd.cls_code === c.code
      ? pages.studentPage({ ...cd, cls: newName }, { title: `${newName} 영어 단어장`, desc: `최신: ${cd.title} · 단어 ${cd.words.length}개`, url: SITE + c.code + ".html" })
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
    const clash = all.filter(n => n === `${code}.html` || new RegExp(`^${code}-\\d{4}-\\d{2}-\\d{2}\\.html$`).test(n));
    for (const n of clash) if (!pointsHere(await gh.getText(n))) return classMsg(`${code}.html 은(는) 이미 쓰였거나 예전에 다른 반이 쓰던 주소예요. 옛 링크가 헷갈리지 않도록 다른 코드를 골라 주세요.`, false);

    const reg = JSON.parse(await gh.getText("classes.json"));
    const target = reg.classes.find(x => x.code === c.code);
    if (!target) throw new Error("반 목록에서 이 반을 찾지 못했어요. 새로고침해 주세요.");
    const oldCode = target.code; target.code = code;
    const files = { "classes.json": JSON.stringify(reg, null, 2) + "\n", "index.html": pages.rootIndex(reg.classes) };
    const re = new RegExp(`^${oldCode}-(\\d{4}-\\d{2}-\\d{2})\\.html$`);
    const moved = [];
    for (const name of all.filter(n => re.test(n))) {
      const html = await gh.getText(name), d = readData(html);
      if (!d) continue; // 이미 안내 페이지
      const date = name.match(re)[1], nn = `${code}-${date}.html`;
      d.cls_code = code; d.home = `${code}.html`;
      files[nn] = pages.studentPage(d, { title: `${target.name} ${d.title}`, desc: `단어를 누르면 발음이 나와요 · 단어 ${d.words.length}개`, url: SITE + nn });
      files[name] = pages.redirectPage(nn);
      moved.push(nn);
    }
    const cd = readData(await gh.getText(`${oldCode}.html`));
    if (cd && cd.cls_code === oldCode) {
      cd.cls_code = code;
      cd.past = (cd.past || []).map(p => ({ ...p, href: p.href.replace(new RegExp(`^${oldCode}-`), `${code}-`) }));
      files[`${code}.html`] = pages.studentPage(cd, { title: `${target.name} 영어 단어장`, desc: `최신: ${cd.title} · 단어 ${cd.words.length}개`, url: SITE + code + ".html" });
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
      ? pages.studentPage({ ...existing, cls: name }, { title: `${name} 영어 단어장`, desc: `최신: ${existing.title} · 단어 ${existing.words.length}개`, url: SITE + code + ".html" })
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
