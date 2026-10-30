// 학생 페이지 만들기 + GitHub 저장소에 올리기
// 페이지 구조는 Python make_site.py 와 같다:
//   index.html (반 목록), e3a.html (반 최신 날짜의 단어장 전부 + 지난 단어장), e3a-2026-10-30.html (날짜별)
//   같은 반·같은 날짜에 제목이 다른 단어장은 e3a-2026-10-30-2.html, -3.html … 로 따로 저장 (2026-10-30)

export const SITE = "https://dnteacher.github.io/Words-Practice/";
const OWNER = "DNTeacher", REPO = "Words-Practice", BRANCH = "main";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DATA_RE = /const DATA = ([^\n]*);\n/;

export function readData(html) {
  const m = html && html.match(DATA_RE);
  return m ? JSON.parse(m[1]) : null;
}

// 날짜별 파일 이름: 반코드-YYYY-MM-DD.html 또는 반코드-YYYY-MM-DD-2.html
export const datedRe = code => new RegExp(`^${code}-(\\d{4}-\\d{2}-\\d{2})(?:-(\\d+))?\\.html$`);
const dateOf = href => (String(href).match(/(\d{4}-\d{2}-\d{2})/) || [""])[0];

// 반 페이지 DATA 의 "그날 단어장들" (예전 형식은 words 하나)
export function setsOf(d, code) {
  if (!d) return [];
  if (Array.isArray(d.sets) && d.sets.length) return d.sets;
  return d.words ? [{ href: `${code || d.cls_code}-${d.date}.html`, title: d.title, words: d.words }] : [];
}
export const wordCount = d => setsOf(d).reduce((n, s) => n + s.words.length, 0);
export function dayTitle(date, sets) {
  if (sets.length === 1) return sets[0].title;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  return m ? `${+m[2]}월 ${+m[3]}일 단어장` : "단어장";
}

export class Pages {
  constructor(base = "app/") { this.base = base; this.student = null; this.list = null; }
  async load() {
    const get = async f => { const r = await fetch(this.base + f, { cache: "no-cache" }); if (!r.ok) throw new Error(f + " 를 불러오지 못했어요"); return r.text(); };
    [this.student, this.list] = await Promise.all([get("student.html"), get("list-page.html")]);
  }
  _og(html, title, desc, url) {
    return html.replace("__OG_TITLE__", esc(title)).replace("__OG_DESC__", esc(desc)).replace("__OG_URL__", esc(url));
  }
  studentPage(data, { title, desc, url }) {
    const js = JSON.stringify(data).replace(/<\//g, "<\\/");
    let h = this._og(this.student, title, desc, url).replace("__PAGE_TITLE__", esc(title));
    return h.replace("/*__WORDBOOK_DATA__*/null", () => js);
  }
  listPage({ title, ogTitle, desc, url, body }) {
    return this._og(this.list, ogTitle || title, desc, url).replace("__PAGE_TITLE__", esc(title)).replace("__BODY__", () => body);
  }
  rootIndex(classes) {
    const items = classes.map(c => `    <li><a href="${esc(c.code)}.html"><span>${esc(c.name)}</span><span class="go" aria-hidden="true">›</span></a></li>`).join("\n");
    const body = `  <h1>영어 단어장</h1>\n  <p class="hint">우리 반을 누르면 외울 단어와 발음이 나와요.</p>\n  <ul class="grid">\n${items}\n  </ul>`;
    return this.listPage({ title: "영어 단어장", desc: "반을 고르면 외울 단어와 발음이 나와요", url: SITE, body });
  }
  emptyClassPage(c) {
    const n = esc(c.name);
    const body = `  <p class="eyebrow">${n} 영어 단어</p>\n  <h1>${n} 영어 단어장</h1>\n  <p class="hint">이 주소에서 우리 반 단어를 들을 수 있어요.</p>\n  <div class="empty">\n    <b>아직 올라온 단어장이 없어요</b>\n    <p>선생님이 단어장을 올리면 이 주소를 열자마자 바로 나와요.</p>\n  </div>\n  <a class="back" href="index.html">‹ 다른 반 보기</a>`;
    return this.listPage({ title: `${c.name} 영어 단어장`, desc: "단어를 누르면 발음이 나와요", url: SITE + c.code + ".html", body });
  }

  // 주소가 바뀐 옛 주소에 남겨 두는 안내 페이지: 열자마자 새 주소로 넘어간다
  redirectPage(href) {
    const h = esc(href), full = esc(SITE + href);
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="wp-redirect" content="${h}">
<meta http-equiv="refresh" content="0; url=${h}">
<link rel="canonical" href="${full}">
<title>주소가 바뀌었어요</title>
<script>location.replace(${JSON.stringify(href)});</script>
</head>
<body style="margin:0;padding:24px;font:16px/1.6 system-ui,sans-serif;background:#EEF2F8;color:#15213B">
<p>단어장 주소가 바뀌었어요. 새 주소로 이동하고 있어요.</p>
<p><a href="${h}" style="color:#2A55D3;font-weight:700">새 주소로 가기 ›</a></p>
</body>
</html>
`;
  }

  // 반 페이지 HTML (그날 단어장 전부 + 지난 단어장)
  classPage(cls, date, sets, past) {
    const title = dayTitle(date, sets);
    const n = sets.reduce((k, s) => k + s.words.length, 0);
    const data = { date, title, sample: false, cls: cls.name, cls_code: cls.code, sets: sets.map(s => ({ href: s.href, title: s.title, words: s.words })), past };
    return this.studentPage(data, {
      title: `${cls.name} 영어 단어장`,
      desc: sets.length > 1 ? `최신: ${title} (단어장 ${sets.length}개) · 단어 ${n}개` : `최신: ${title} · 단어 ${n}개`,
      url: SITE + cls.code + ".html",
    });
  }
  datedPage(cls, href, set) {
    return this.studentPage({ date: set.date, title: set.title, sample: false, words: set.words, cls: cls.name, cls_code: cls.code, home: `${cls.code}.html` }, {
      title: `${cls.name} ${set.title}`, desc: `단어를 누르면 발음이 나와요 · 단어 ${set.words.length}개`, url: SITE + href,
    });
  }

  // 지금 반 페이지에 있는 단어장 목록 (최신 날짜 단어장들 + 지난 단어장). [{href, date, title, n, words?}]
  entriesOf(cls, currentClassHtml) {
    const cur = readData(currentClassHtml);
    if (!cur || cur.cls_code !== cls.code) return [];
    const out = setsOf(cur, cls.code).map(s => ({ href: s.href, date: cur.date, title: s.title, n: s.words.length, words: s.words }));
    for (const p of cur.past || []) out.push({ href: p.href, date: p.date || dateOf(p.href), title: p.title, n: p.n });
    return out;
  }

  // 새 단어장(set) 을 올릴 때 바뀌는 파일: 그 단어장 페이지, 반 페이지.
  //  - replaceHref: '지난 단어장 고치기'로 불러온 단어장 (날짜가 같으면 그 파일을 고친다)
  //  - 같은 날짜에 같은 제목이 있으면 그 단어장을 바꾸고, 제목이 다르면 새 단어장으로 추가 (-2, -3 …)
  //  - getData(href): 반 페이지에 단어가 없는 최신 날짜 단어장의 DATA 를 가져오는 함수 (예전 형식 대비)
  //  - existing: 저장소에 있는 파일 이름들 (빈 이름 고르기용)
  async buildSetFiles(cls, set, currentClassHtml, { replaceHref = null, getData = null, existing = [] } = {}) {
    const entries = this.entriesOf(cls, currentClassHtml);
    const sameDay = entries.filter(e => e.date === set.date);
    let href = null;
    if (replaceHref && dateOf(replaceHref) === set.date && datedRe(cls.code).test(replaceHref)) href = replaceHref;
    if (!href) { const same = sameDay.find(e => e.title === set.title); if (same) href = same.href; }
    const replacing = !!href;
    if (!href) {
      const used = new Set([...sameDay.map(e => e.href), ...existing.filter(n => dateOf(n) === set.date && datedRe(cls.code).test(n))]);
      const base = `${cls.code}-${set.date}`;
      href = `${base}.html`;
      for (let k = 2; used.has(href); k++) href = `${base}-${k}.html`;
    }
    const entry = { href, date: set.date, title: set.title, n: set.words.length, words: set.words };
    const at = entries.findIndex(e => e.href === href);
    if (at >= 0) entries[at] = entry; else entries.push(entry);
    // 날짜 최신순 (같은 날짜 안에서는 올린 순서 그대로)
    const order = new Map(entries.map((e, i) => [e, i]));
    entries.sort((x, y) => y.date.localeCompare(x.date) || order.get(x) - order.get(y));
    const latestDate = entries[0].date;
    const latest = entries.filter(e => e.date === latestDate);
    for (const e of latest) {
      if (e.words) continue;
      const d = getData ? readData(await getData(e.href)) : null;
      e.words = d ? d.words : [];
    }
    const past = entries.filter(e => e.date !== latestDate).map(e => ({ href: e.href, title: e.title, n: e.n, date: e.date }));
    return {
      files: { [href]: this.datedPage(cls, href, set), [`${cls.code}.html`]: this.classPage(cls, latestDate, latest, past) },
      file: href, replacing, sameDayCount: entries.filter(e => e.date === set.date).length,
    };
  }
}

// ---------- GitHub ----------
export class GitHub {
  constructor(token, branch = BRANCH) { this.token = token; this.branch = branch; }
  async api(path, { method = "GET", body, accept } = {}) {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${this.token}`, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r;
  }
  async check() {
    const r = await this.api("");
    if (r.status === 401) return { ok: false, why: "열쇠(토큰)가 맞지 않거나 기한이 지났어요." };
    if (r.status === 404) return { ok: false, why: "열쇠로 Words-Practice 저장소를 볼 수 없어요. 만들 때 저장소를 Words-Practice 로 골랐는지 확인해 주세요." };
    if (!r.ok) return { ok: false, why: `GitHub 응답 오류 (${r.status})` };
    const j = await r.json();
    if (!j.permissions || !j.permissions.push) return { ok: false, why: "열쇠에 쓰기 권한이 없어요. Contents 를 Read and write 로 골라 주세요." };
    return { ok: true };
  }
  async getText(path) {
    const r = await this.api(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${this.branch}`, { accept: "application/vnd.github.raw+json" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${path} 를 읽지 못했어요 (${r.status})`);
    return r.text();
  }
  async listRoot() {
    const r = await this.api(`/contents/?ref=${this.branch}`);
    if (!r.ok) throw new Error(`파일 목록을 읽지 못했어요 (${r.status})`);
    return (await r.json()).map(f => f.name);
  }
  // 여러 파일을 커밋 하나로 올린다. files: {경로: 내용}
  async commit(files, message) {
    const json = async r => { if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(`GitHub 오류 ${r.status}: ${t.slice(0, 200)}`), { status: r.status }); } return r.json(); };
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await json(await this.api(`/git/ref/heads/${this.branch}`));
      const head = ref.object.sha;
      const commit = await json(await this.api(`/git/commits/${head}`));
      const tree = [];
      for (const [path, content] of Object.entries(files)) {
        const blob = await json(await this.api("/git/blobs", { method: "POST", body: { content, encoding: "utf-8" } }));
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const newTree = await json(await this.api("/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree } }));
      const newCommit = await json(await this.api("/git/commits", { method: "POST", body: { message, tree: newTree.sha, parents: [head] } }));
      const r = await this.api(`/git/refs/heads/${this.branch}`, { method: "PATCH", body: { sha: newCommit.sha } });
      if (r.ok) return newCommit.sha;
      if (r.status !== 422 && r.status !== 409) await json(r);
    }
    throw new Error("다른 변경과 겹쳐서 올리지 못했어요. 잠시 뒤 다시 눌러 주세요.");
  }
}
