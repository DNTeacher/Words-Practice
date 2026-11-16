// 휴대폰용 '누가 들었나요?' 페이지 (who.html, 2026-11-16)
// 선생님이 아이폰 홈 화면에 '들어Voca'로 추가해서 기록만 보는 가벼운 페이지. 발음 AI는 불러오지 않는다.
// 열쇠는 선생님 앱과 같은 localStorage 'wp-gh-token' (아이폰 홈 화면 앱은 사파리와 저장 공간이 따로라 한 번 더 넣는다).
import { GitHub, Pages } from "./site.js?v=27";
import { Listen, cellState, latestSets, shortTime } from "./listen.js?v=27";

const $ = id => document.getElementById(id);
const LS = { token: "wp-gh-token", cls: "wp-who-cls" };
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
const dayLabel = date => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""); return m ? `${+m[2]}월 ${+m[3]}일` : date; };
const nowLabel = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

const pages = new Pages("app/");  // entriesOf 만 쓴다 (틀은 안 불러옴)
let gh = null, L = null, classes = [], seq = 0, loadedAt = 0;

function msg(text, kind) {
  const m = $("msg");
  m.textContent = text || ""; m.className = "msg" + (kind ? " " + kind : ""); m.hidden = !text;
}

// ---------- 열쇠 ----------
function showKey(note) {
  $("keyView").hidden = false; $("mainView").hidden = true; $("refresh").hidden = true;
  $("keyNote").textContent = note || ""; $("keyNote").hidden = !note;
  setTimeout(() => $("keyIn").focus(), 50);
}
$("keySave").addEventListener("click", async () => {
  const t = $("keyIn").value.trim();
  if (!t) { $("keyNote").textContent = "열쇠를 붙여 넣어 주세요."; $("keyNote").hidden = false; return; }
  $("keySave").disabled = true; $("keySave").textContent = "확인하는 중…";
  const g = new GitHub(t);
  let r; try { r = await g.check(); } catch (e) { r = { ok: false, why: "GitHub에 연결하지 못했어요. 인터넷을 확인해 주세요." }; }
  $("keySave").disabled = false; $("keySave").textContent = "저장하고 보기";
  if (!r.ok) { $("keyNote").textContent = r.why; $("keyNote").hidden = false; return; }
  store.set(LS.token, t); $("keyIn").value = "";
  start();
});
$("keyIn").addEventListener("keydown", e => { if (e.key === "Enter") $("keySave").click(); });
$("changeKey").addEventListener("click", () => showKey("새 열쇠를 넣으면 이 휴대폰에 저장된 열쇠가 바뀌어요."));

// ---------- 시작 ----------
async function start() {
  const t = store.get(LS.token);
  if (!t) return showKey();
  gh = new GitHub(t);
  $("keyView").hidden = true; $("mainView").hidden = false; $("refresh").hidden = false;
  await loadAll();
}

async function loadAll() {
  const my = ++seq;
  msg("불러오는 중…");
  try {
    L = new Listen(gh);
    const [, txt] = await Promise.all([L.load(), gh.getText("classes.json")]);
    classes = (txt && JSON.parse(txt).classes) || [];
  } catch (e) {
    if (my !== seq) return;
    if (/\(401\)/.test(e.message || "")) return showKey("열쇠가 맞지 않거나 기한이 지났어요. 새 열쇠를 넣어 주세요.");
    msg("불러오지 못했어요: " + (e.message || e) + " · 잠시 뒤 새로고침을 눌러 주세요.", "bad");
    return;
  }
  if (my !== seq) return;
  renderSelect();
  await show();
}

function renderSelect() {
  const sel = $("cls"), prev = sel.value || store.get(LS.cls);
  const named = classes.filter(c => L.namesOf(c.code).length), rest = classes.filter(c => !named.includes(c));
  sel.replaceChildren(
    ...(named.length ? [h("optgroup", { label: "학생 이름이 있는 반" }, ...named.map(c => h("option", { value: c.code }, `${c.name} (${L.namesOf(c.code).length}명)`)))] : []),
    ...(rest.length ? [h("optgroup", { label: "이름을 아직 안 넣은 반" }, ...rest.map(c => h("option", { value: c.code }, c.name)))] : []));
  if (prev && classes.some(c => c.code === prev)) sel.value = prev;
  else if (named.length) sel.value = named[0].code;
}
$("cls").addEventListener("change", () => { store.set(LS.cls, $("cls").value); show(); });

// ---------- 기록 ----------
async function show() {
  const my = ++seq, c = classes.find(x => x.code === $("cls").value);
  $("latest").replaceChildren(); $("sum").replaceChildren(); $("list").replaceChildren();
  $("latest").hidden = true; $("list").hidden = true;
  $("sheet").hidden = !(L && L.connected && L.cfg.sheet);
  if (L && L.cfg && L.cfg.sheet) $("sheet").href = L.cfg.sheet;
  if (!c) { msg("반이 없어요. 컴퓨터 선생님 앱의 설정에서 반을 확인해 주세요."); return; }
  if (!L.connected) { msg("아직 구글 시트가 연결되지 않았어요. 컴퓨터 선생님 앱의 설정 → ‘듣기 기록 — 구글 시트 연결’을 먼저 해 주세요."); return; }
  const names = L.namesOf(c.code);
  if (!names.length) { msg(`${c.name}은 학생 이름이 아직 없어요. 컴퓨터 선생님 앱의 ‘누가 들었나요?’ → 이름 넣기에서 넣어 주세요.`); return; }
  msg("기록 불러오는 중…");
  let entries, recs;
  try {
    const [html, rows] = await Promise.all([gh.getText(`${c.code}.html`), L.read(c.code)]);
    entries = latestSets(pages.entriesOf(c, html)); recs = rows;
  } catch (e) {
    if (my === seq) msg((e.message || String(e)) + " · 잠시 뒤 새로고침을 눌러 주세요.", "bad");
    return;
  }
  if (my !== seq) return;
  loadedAt = Date.now();
  if (!entries.length) { msg("이 반에 올린 단어장이 아직 없어요."); return; }
  msg("");
  const by = new Map(recs.map(r => [`${r.name}|${r.list}`, r]));
  const since = ((L.cfg && L.cfg.saved) || "").slice(0, 10);
  const one = entries.length === 1, latest = entries[0].date;
  const badge = (s, e) => {
    const st = cellState(by.get(`${s.en}|${e.href}`));
    if (st.kind === "none") return { st, el: since && e.date < since ? h("span", { class: "st pre" }, "· 기록 전") : h("span", { class: "st none" }, "– 안 들음") };
    return { st, el: st.kind === "ok" ? h("span", { class: "st ok" }, "✓ 다 들음") : h("span", { class: "st part" }, `◐ ${st.heard}/${st.total}`) };
  };

  // 어떤 숙제인지
  $("latest").append(
    h("b", {}, one ? entries[0].title : `${dayLabel(latest)} 숙제 ${entries.length}개`),
    h("span", {}, one ? `${dayLabel(latest)} 숙제 · ${entries[0].n}단어` : entries.map(e => `${e.title} (${e.n}단어)`).join(", ")));
  $("latest").hidden = false;

  // 요약 (단어장이 하나일 때)
  if (one) {
    const k = names.map(s => cellState(by.get(`${s.en}|${entries[0].href}`)).kind);
    const n = x => k.filter(y => y === x).length;
    $("sum").append(h("span", { class: "st ok" }, `✓ 다 들음 ${n("ok")}명`), h("span", { class: "st part" }, `◐ 듣는 중 ${n("part")}명`), h("span", { class: "st none" }, `– 안 들음 ${n("none")}명`));
  }

  // 학생마다 한 줄
  $("list").append(...names.map(s => {
    const who = h("div", { class: "n" }, h("span", { lang: "en" }, s.en), s.ko ? h("small", {}, s.ko) : null);
    if (one) {
      const { st, el } = badge(s, entries[0]);
      return h("li", { class: "r" }, who, h("div", { class: "s" }, el, st.kind !== "none" && st.last ? h("span", { class: "t" }, shortTime(st.last)) : null));
    }
    return h("li", { class: "r r2" }, who, h("div", { class: "s" }, ...entries.map(e => {
      const { st, el } = badge(s, e);
      return h("div", { class: "line" }, h("b", {}, e.title), el, st.kind !== "none" && st.last ? h("span", { class: "t" }, shortTime(st.last)) : null);
    })));
  }));
  $("list").hidden = false;
  $("upd").textContent = `${nowLabel()}에 불러왔어요 · 학생 기록은 1~2분 늦게 보일 수 있어요`;
}

$("refresh").addEventListener("click", () => { if (gh) loadAll(); });
// 홈 화면 앱은 닫지 않고 다시 열 때가 많아서, 다시 열었을 때 1분 넘게 지났으면 새로 불러온다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && gh && L && Date.now() - loadedAt > 60000) show();
});

start().catch(e => { console.error(e); msg("문제가 생겼어요: " + (e.message || e), "bad"); });
