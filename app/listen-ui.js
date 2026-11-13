// 선생님 앱: '누가 들었나요?' 칸 + 학생 이름 고치기 + 설정의 구글 시트 연결 (2026-11-13)
import { Listen, appsScript, newKey, isWebAppUrl, cleanUrl, parseNames, formatNames, cellState } from "./listen.js?v=23";

const PENDING_KEY = "wp-listen-key-pending";

export function setupListen({ $, h, store, pages, getGh, getClasses, dayLabel, isFuture, openSettings }) {
  let L = null, loadErr = null, seq = 0;
  const card = $("listenCard");
  const cls = () => getClasses().find(c => c.code === $("listenCls").value);
  const short = t => { const m = /^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(t || ""); return m ? `${+m[1]}/${+m[2]} ${m[3]}` : (t || ""); };
  const status = (el, msg, ok) => { el.textContent = msg || ""; el.className = "status" + (msg ? (ok === true ? " ok" : ok === false ? " bad" : "") : ""); };

  // ---------- 처음 불러오기 ----------
  async function start() {
    const gh = getGh();
    card.hidden = !gh;
    if (!gh) return;
    L = new Listen(gh);
    try { await L.load(); loadErr = null; } catch (e) { loadErr = e; }
    renderSelect();
    renderSettings();
    await show();
  }

  function renderSelect() {
    const all = getClasses(), sel = $("listenCls"), prev = sel.value;
    const named = all.filter(c => L && L.namesOf(c.code).length), rest = all.filter(c => !named.includes(c));
    sel.replaceChildren(
      ...(named.length ? [h("optgroup", { label: "학생 이름이 있는 반" }, ...named.map(c => h("option", { value: c.code }, `${c.name} (${L.namesOf(c.code).length}명)`)))] : []),
      ...(rest.length ? [h("optgroup", { label: "이름을 아직 안 넣은 반" }, ...rest.map(c => h("option", { value: c.code }, c.name)))] : []));
    if (prev && all.some(c => c.code === prev)) sel.value = prev;
    else if (named.length) sel.value = named[0].code;
  }

  // ---------- 표 ----------
  async function show() {
    const my = ++seq, c = cls();
    $("namesEdit").hidden = true;
    $("listenTable").replaceChildren(); $("listenSum").replaceChildren(); status($("listenStatus"), "");
    if (loadErr) { status($("listenStatus"), "설정을 읽지 못했어요: " + (loadErr.message || loadErr), false); return; }
    if (!c) return;
    const names = L.namesOf(c.code);
    $("listenNames").replaceChildren(...(names.length
      ? ["학생 ", ...names.flatMap((s, i) => [i ? " · " : "", h("b", { lang: "en" }, s.en)])]
      : ["이 반은 학생 이름이 아직 없어요"]));
    $("listenEditNames").textContent = names.length ? "이름 고치기" : "이름 넣기";
    $("listenSetup").hidden = L.connected;
    $("listenSheet").hidden = !(L.connected && L.cfg.sheet);
    if (L.cfg && L.cfg.sheet) $("listenSheet").href = L.cfg.sheet;
    if (!names.length) return;
    if (!L.connected) {
      $("listenTable").append(h("p", { class: "lempty" }, "구글 시트를 연결하면 학생마다 들은 단어가 여기에 나와요."));
      return;
    }
    status($("listenStatus"), "기록 불러오는 중…");
    let entries = [], recs = [];
    try {
      const gh = getGh();
      const [html, rows] = await Promise.all([gh.getText(`${c.code}.html`), L.read(c.code)]);
      entries = pages.entriesOf(c, html).filter(e => !isFuture(e.showFrom))
        .sort((a, b) => b.date.localeCompare(a.date) || b.href.localeCompare(a.href)).slice(0, 3);
      recs = rows;
    } catch (e) {
      if (my === seq) status($("listenStatus"), (e.message || String(e)) + " · 잠시 뒤 ‘새로고침’을 눌러 주세요.", false);
      return;
    }
    if (my !== seq) return;
    status($("listenStatus"), "");
    if (!entries.length) { $("listenTable").append(h("p", { class: "lempty" }, "이 반에 올린 단어장이 아직 없어요.")); return; }
    const by = new Map(recs.map(r => [`${r.name}|${r.list}`, r]));
    const latest = entries[0].date;
    const since = ((L.cfg && L.cfg.saved) || "").slice(0, 10);  // 연결한 날: 그 전 단어장의 빈 칸은 '기록 전'
    const cell = (s, e) => {
      const st = cellState(by.get(`${s.en}|${e.href}`));
      if (st.kind === "none") return e.date !== latest && since && e.date < since
        ? h("td", {}, h("span", { class: "st pre", title: "구글 시트를 연결하기 전 단어장이에요" }, "· 기록 전"))
        : h("td", {}, h("span", { class: "st none" }, "– 안 들음"));
      const t = short(st.last);
      return st.kind === "ok"
        ? h("td", {}, h("span", { class: "st ok" }, "✓ 다 들음"), h("small", {}, `${st.heard}/${st.total}${t ? " · " + t : ""}`))
        : h("td", {}, h("span", { class: "st part" }, `◐ ${st.heard}/${st.total}`), h("small", {}, t));
    };
    $("listenTable").append(h("div", { class: "lscroll" }, h("table", { class: "who" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "학생"), ...entries.map(e =>
        h("th", { scope: "col", class: e.date === latest ? "cur" : null }, e.title, h("small", {}, `${dayLabel(e.date)} 숙제` + (e.date === latest ? " · 지금 보이는 단어장" : "")))))),
      h("tbody", {}, ...names.map(s => h("tr", {}, h("th", { scope: "row", class: "nm" }, h("span", { lang: "en" }, s.en), s.ko ? h("small", {}, s.ko) : null), ...entries.map(e => cell(s, e))))))));
    // 지금 보이는 단어장(들) 요약
    for (const e of entries.filter(x => x.date === latest)) {
      const sts = names.map(s => ({ s, k: cellState(by.get(`${s.en}|${e.href}`)).kind }));
      const n = k => sts.filter(x => x.k === k);
      const none = n("none");
      $("listenSum").append(h("span", { class: "sl" }, h("span", { class: "k" }, `${e.title}:`),
        h("span", { class: "st ok" }, `✓ 다 들음 ${n("ok").length}명`),
        h("span", { class: "st part" }, `◐ 듣는 중 ${n("part").length}명`),
        h("span", { class: "st none" }, `– 안 들음 ${none.length}명` + (none.length && none.length <= 4 ? ` (${none.map(x => x.s.en).join(", ")})` : ""))));
    }
  }

  // ---------- 학생 이름 ----------
  $("listenEditNames").addEventListener("click", () => {
    const c = cls(); if (!c || !L) return;
    $("namesFor").textContent = c.name;
    $("namesText").value = formatNames(L.namesOf(c.code));
    $("namesErr").textContent = "";
    $("namesEdit").hidden = false;
    $("namesText").focus();
  });
  $("namesCancel").addEventListener("click", () => { $("namesEdit").hidden = true; });
  $("namesSave").addEventListener("click", async () => {
    const c = cls(); if (!c || !L) return;
    const { list, errs } = parseNames($("namesText").value);
    if (errs.length) { $("namesErr").textContent = errs.join("\n"); return; }
    if (!list.length && L.namesOf(c.code).length && !confirm(`${c.name}의 학생 이름을 모두 지울까요? 이 반 학생 화면에서는 이름 고르기와 기록이 꺼져요.`)) return;
    $("namesSave").disabled = true; status($("listenStatus"), "저장하는 중…");
    try {
      await L.saveNames(c.code, list, c.name);
      renderSelect(); $("listenCls").value = c.code;
      await show();
      status($("listenStatus"), `${c.name} 학생 ${list.length}명을 저장했어요. 학생 화면에는 1~2분 뒤에 반영돼요.`, true);
    } catch (e) {
      $("namesErr").textContent = "저장하지 못했어요: " + (e.message || e);
    } finally { $("namesSave").disabled = false; }
  });

  $("listenCls").addEventListener("change", show);
  $("listenRefresh").addEventListener("click", async () => { if (L) { try { await L.load(); loadErr = null; } catch (e) { loadErr = e; } } renderSettings(); show(); });
  $("listenOpenSet").addEventListener("click", () => { openSettings(); setTimeout(() => $("listenSetBox").scrollIntoView({ block: "start" }), 50); });

  // ---------- 설정: 구글 시트 연결 ----------
  function keyForScript() {
    if (L && L.connected) return L.cfg.key;  // 이미 연결: 같은 열쇠 (스크립트를 다시 붙여 넣어도 그대로 쓰도록)
    let k = store.get(PENDING_KEY);
    if (!/^[A-Za-z0-9]{16,64}$/.test(k || "")) { k = newKey(); store.set(PENDING_KEY, k); }
    return k;
  }
  function renderSettings() {
    const on = !!(L && L.connected);
    status($("listenSetStatus"), on ? `연결됨 · ${dayLabel((L.cfg.saved || "").slice(0, 10))}에 연결했어요. 학생 화면에서 이름 고르기와 기록이 켜져 있어요.` : (getGh() ? "아직 연결하지 않았어요." : "먼저 위에서 GitHub 열쇠를 넣어 주세요."), on ? true : null);
    $("disconnectListen").hidden = !on;
    $("listenSetSheet").hidden = !(on && L.cfg.sheet);
    if (on && L.cfg.sheet) $("listenSetSheet").href = L.cfg.sheet;
  }
  $("copyScript").addEventListener("click", async () => {
    if (!getGh()) { status($("listenConnStatus"), "먼저 위에서 GitHub 열쇠를 넣어 주세요.", false); return; }
    const text = appsScript(keyForScript());
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
    $("scriptBox").value = text;
    $("scriptBox").hidden = ok;
    if (!ok) { $("scriptBox").focus(); $("scriptBox").select(); }
    $("copyNote").textContent = ok ? "복사했어요. Apps Script 화면에 붙여 넣어 주세요." : "자동 복사가 막혔어요. 아래 글자가 모두 선택되어 있으니 Ctrl+C 로 복사해 주세요.";
  });
  $("connectListen").addEventListener("click", async () => {
    if (!getGh() || !L) { status($("listenConnStatus"), "먼저 위에서 GitHub 열쇠를 넣어 주세요.", false); return; }
    const url = cleanUrl($("webappUrl").value);
    if (!isWebAppUrl(url)) { status($("listenConnStatus"), "웹 앱 URL 모양이 아니에요. https://script.google.com/macros/s/…/exec 로 된 주소를 붙여 넣어 주세요. (시트 주소나 Apps Script 편집 화면 주소가 아니에요)", false); return; }
    const key = L.connected ? L.cfg.key : store.get(PENDING_KEY);
    if (!key) { status($("listenConnStatus"), "먼저 ‘스크립트 복사’를 눌러 스크립트를 붙여 넣고 배포해 주세요.", false); return; }
    $("connectListen").disabled = true; status($("listenConnStatus"), "구글 시트에 연결하는 중… (처음에는 10초쯤 걸릴 수 있어요)");
    try {
      await L.connect(url, key);
      store.set(PENDING_KEY, null);
      $("webappUrl").value = "";
      status($("listenConnStatus"), "연결했어요! 이제 학생이 단어를 끝까지 들으면 구글 시트에 기록돼요. 학생 화면에는 1~2분 뒤부터 이름 고르기가 나와요.", true);
      renderSettings(); renderSelect(); await show();
    } catch (e) {
      status($("listenConnStatus"), "연결하지 못했어요: " + (e.message || e) + " — 배포할 때 ‘액세스 권한: 모든 사용자’로 했는지, 스크립트를 붙여 넣은 뒤 저장했는지 확인해 주세요.", false);
    } finally { $("connectListen").disabled = false; }
  });
  $("disconnectListen").addEventListener("click", async () => {
    if (!L || !confirm("학생 페이지에서 이름 고르기와 기록을 끌까요? 구글 시트에 쌓인 기록은 그대로 남아요. 다시 켜려면 웹 앱 URL 로 다시 연결하면 돼요.")) return;
    $("disconnectListen").disabled = true;
    try { await L.disconnect(); status($("listenConnStatus"), "껐어요. 학생 화면에는 1~2분 뒤 반영돼요.", true); renderSettings(); await show(); }
    catch (e) { status($("listenConnStatus"), "끄지 못했어요: " + (e.message || e), false); }
    finally { $("disconnectListen").disabled = false; }
  });

  return { start, refreshClasses: () => { if (L) { renderSelect(); show(); } } };
}
