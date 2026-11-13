# 들어Voca — Claude Code 안내 (CLAUDE.md, 2026-11-13)

> 이 저장소(Words-Practice)가 최종 코드예요. 학생 페이지 틀 원본과 Python 도구는 `tools/`, 자세한 설계 기록은 `tools/DESIGN.md`.
> 한글 학생 이름(`Words-Books/students.json`)과 듣기 기록 열쇠(`Words-Books/listen.json`)는 비공개 저장소에만 있어요. 이 공개 저장소에 넣지 마세요.

---

## 0. Claude Code에게 먼저 (이 부분만 붙여 넣어도 됨)

**무엇인가**: 영어 학원 선생님(다나쌤)이 쓰는 단어 발음 연습 사이트 **들어Voca**.
선생님 앱에 단어·뜻을 넣으면 브라우저 안 AI(Kokoro TTS 음성 + Whisper 음성인식)가 발음 mp3를 만들고 다시 받아 적어 확인한 뒤,
GitHub Pages에 반별 학생 페이지로 올린다. 학생은 카톡으로 받은 주소에서 단어를 눌러 발음을 듣는다.

**저장소**
- `DNTeacher/Words-Practice` (공개) — 사이트 전체. GitHub Pages: https://dnteacher.github.io/Words-Practice/
  - 선생님 앱: `teacher.html` + `app/*.js` (빌드 없음, 브라우저 ES 모듈)
  - 학생 페이지: `반코드.html`(반 주소: 가장 최근 숙제 날짜의 단어장들 + 지난 단어장), `반코드-YYYY-MM-DD(-N).html`(이 단어장만 주소). 모두 `app/student.html` 틀 + `const DATA = {...};` 한 줄.
  - `classes.json`(반 목록), `listen.json`(듣기 기록: 구글 시트 웹 앱 주소 + 반별 **영어 이름만**)
- `DNTeacher/Words-Books` (비공개) — 선생님 토큰으로만 읽고 씀
  - `books/index.json` + `books/<id>.json`: 교재 단어장 정리본 (반마다 쓰는 단어장 목록 `classes`, 짧은 이름 `short`)
  - `drafts/`: 준비해 둔 단어장(소리까지 만든 것, 나중에 올리기)
  - `students.json`: 반별 학생 이름(한글+영어), `listen.json`: 듣기 기록 웹 앱 주소·열쇠(KEY)
- 학생 페이지 틀의 원본은 `tools/template.html` → 저장소 폴더에서 `python3 tools/export_app_templates.py .` 로 `app/student.html`, `app/list-page.html` 생성 (`app/student.html`을 직접 고치지 말고 `tools/template.html`을 고친 뒤 내보내기). `tools/make_site.py`는 같은 틀을 쓰는 Python 판(예전 방식·비교용).

**꼭 지킬 것**
1. `app/` 파일이나 `teacher.html`을 고치면 버전 꼬리표 `?v=N`을 **전부** 하나 올린다 (teacher.html, app/*.js 의 import, dict 주소, engine.js 의 worker.js 주소). 현재 **v=24**. (GitHub Pages 캐시 10분 때문)
2. 비밀은 공개 저장소·학생 페이지 코드에 넣지 않는다: 선생님 GitHub 토큰은 선생님 브라우저 localStorage(`wp-gh-token`)에만, 듣기 기록 KEY는 `Words-Books/listen.json`에만. 한글 학생 이름은 `Words-Books/students.json`에만, 공개 `listen.json`에는 영어 이름만.
3. 날짜 칸 = **숙제 날짜**. 반 주소 맨 위는 가장 최근 숙제 날짜의 단어장. 같은 날짜+같은 제목(다음 시험 칸) = 바꾸기, 제목이 다르면 여러 개.
4. 선생님이 준 단어장 내용(뜻 등)은 함부로 고치지 않는다. 영어 철자 오타만 고치고 단어장 JSON의 `fixes`에 기록, 선생님께 알린다.
5. 이미 올린 학생 페이지를 다시 만들 때는 `DATA` 줄을 글자 하나 안 바꾸고 틀만 바꾼다 (소리 mp3가 DATA 안에 들어 있음).
6. 선생님은 개발자가 아니다. 설명은 쉬운 한국어로, 버튼 이름 그대로.

**시험한 방법 (이 작업은 클라우드 작업 공간에서 했음 — 선생님 컴퓨터에는 없음)**
- 가짜 GitHub(Playwright route로 Git Data API 흉내) 위에서 선생님 앱 전체 흐름 자동 시험.
- 소리: Python Kokoro(kokoro-v1.0.onnx, af_heart)로 같은 소리를 만들고 음성인식 2개(Parakeet TDT 0.6B, Whisper base.en, sherpa-onnx)로 받아 적어 비교.
- 구글 Apps Script: `app/listen.js`의 스크립트를 Node `vm`에서 가짜 SpreadsheetApp·LockService·ContentService로 돌려 시험 + 실제 배포 후 학생 페이지에서 연결 확인(쓰기 없이).

---

## 1. 화면과 흐름 한눈에

- **선생님 앱** `teacher.html`
  - 맨 위 **✓ 누가 들었나요?** (v=23): 반 고르기 → 최근 단어장 3개 × 학생 표 (✓ 다 들음 / ◐ n/N / – 안 들음 / · 기록 전), 이름 고치기
  - **★ 준비해 둔 단어장** (v=16): 미리 만들어 둔 단어장 목록 → 미리 보기·고치기·올리기·지우기
  - **1 반과 날짜**: 반 / 숙제 날짜 / 다음 시험 (+ 단어장에서 가져오기: 범위 적기 → 단어·뜻 자동 입력)
  - **2 단어와 뜻** → 발음 만들기(브라우저 AI) → 단어마다 확인·다른 소리 고르기 → 올리기 / 예약 / 준비해 두기
  - 설정: GitHub 열쇠, **듣기 기록 — 구글 시트 연결**(v=23), 반 목록(추가·이름 바꾸기·주소 바꾸기·빼기)
- **학생 페이지**: 단어를 누르면 발음, 모두 듣기. (v=23) 반에 이름이 있고 구글 시트가 연결돼 있으면 처음에 "누가 듣나요?"로 이름 고르기 → 끝까지 들은 단어에 ✓ → 기록이 선생님 구글 시트로.

---

## 2. 바뀐 내용 (최근 → 예전, 2026-11-09 ~ 11-14)

### v=24 (11-14) 선생님 앱 한 화면 배치 (넓은 화면에서 페이지 스크롤 없음) + 글씨·칸 읽기 쉽게
| 파일 | 바뀐 부분 |
|---|---|
| `teacher.html` | 화면 너비 1100px 이상·높이 600px 이상이면 `.shell` 배치: 왼쪽 `.side` = 누가 들었나요?(늘 펼침), 오른쪽 `.work` = 맨 위 준비해 둔 단어장(접으면 한 줄 요약) + `.cols` 두 칸(`.col.make` 1·2번 / `.col.check` 올린 결과 `#doneCard`·빈 안내 `#resultEmpty`·3번). 칸마다 그 칸 안에서만 스크롤, 아래 올리기 막대는 고정 대신 맨 아래 줄. 좁은 화면은 예전 한 줄 배치 그대로. '단어장에서 가져오기'·'지난 단어장 고치기'·'준비해 둔 단어장'은 `<details>`(접었다 펴기). 칸이 좁으면 container query 로 3번 단어 줄을 촘촘하게. 회색 글씨 조금 진하게(`--ink-soft`), 설명 글씨 13→14px, 입력 칸은 흰 바탕 + 진한 테두리(`--line`) |
| `app/app.js` | 접었다 편 상태 기억(localStorage `wp-fold:draftFold/bookBox/prevBox`), `renderDrafts()`에서 접힌 줄 요약(`#draftCount`, `#draftPeek`) |
| `app/listen-ui.js` | 표 칸 줄임: 다 들음 칸은 시각만(단어 수는 마우스를 올리면), 단어장 제목 아래 '지금 보이는 단어장'을 따로 한 줄 |

### v=23 (11-13) 누가 들었나요? — 학생 이름 고르기 + 끝까지 들은 단어 기록 (구글 시트)
커밋: Words-Practice `65d95e3`, `f4415e2`(선생님 앱이 연결하면서 만든 커밋), Words-Books `b984fba`, `38d0ffe`(앱이 만든 커밋)

| 파일 | 바뀐 부분 |
|---|---|
| `app/listen.js` (새 파일) | 구글 Apps Script 코드 문자열 `SCRIPT`(+`appsScript(key)`로 열쇠 넣기), `jsonp()`, `parseNames()`/`formatNames()`(한 줄에 한 명 "홍길동 Tom", 영어 이름 필수·반 안에서 중복 금지), `Listen` 클래스(`load`, `saveNames`, `ping`, `connect`, `disconnect`, `read`), `cellState()` |
| `app/listen-ui.js` (새 파일) | `setupListen()`: 맨 위 카드(반 고르기·표·요약 줄·이름 고치기), 설정의 구글 시트 연결(스크립트 복사 → 웹 앱 URL → 연결하고 저장 / 기록 끄기) |
| `teacher.html` | CSS 블록 `/* 누가 들었나요? */`, `#listenCard` 섹션(★ 준비해 둔 단어장 앞), 설정 dialog 안 `#listenSetBox` 섹션(반 목록 앞), 꼬리표 v=23 |
| `app/app.js` | `import { setupListen }`, `let listenUI`, `init()`에서 `loadClasses()` 뒤 `setupListen({...}).start()`, `loadClasses()` 끝에 `listenUI.refreshClasses()`, 열쇠 저장·지우기 뒤 `listenUI.start()` |
| `tools/template.html` → `app/student.html` | CSS(`.me` 카드, `.pick` 이름 창, `.row.heard .num::after` ✓), `#me` 카드, `#pick` 대화상자, 단어마다 `rowList/rowIdx/labels`, 묶음 제목 `gcEls`, 재생 `ended`에서 `heardWord()`, 끝부분에 기록 코드(아래) |
| `listen.json` (공개, 새 파일) | `{ url: 웹 앱 주소, classes: { e3a: [영어 이름…], e3b, e4a, e4b, e5b } }` |
| `Words-Books/students.json` (비공개, 새 파일) | 5개 반 23명 한글+영어 이름 (이 문서에는 없음) |
| `Words-Books/listen.json` (비공개, 앱이 만듦) | `{ url, key, sheet, saved, v }` (이 문서에는 없음) |
| 5개 반 기존 페이지 38개 | 새 틀로 다시 만듦 (DATA 그대로 확인, 예약 기능 전 옛 틀 3개 포함) |

학생 페이지 기록 방식
- 같은 폴더 `listen.json`을 읽어 **이 반 이름이 있고 url이 `https://script.google.com/macros/s/…/exec` 모양일 때만** 켜짐. 미리 보기(blob:)·이름 없는 반은 예전과 같음.
- 이름: localStorage `dv-name:반코드`. 들은 번호: `dv-heard:반:이름:단어장파일`, 보낸 개수: `dv-sent:…`.
- **audio `ended`(끝까지 재생)만 들음**으로 침. 단어장 구분 = 날짜별 파일 이름(반 페이지는 `sets[].href`, 날짜별 페이지는 주소의 파일 이름) → 반 주소와 '이 단어장만' 주소 기록이 이어짐.
- 보내기: 1.5초 모아 JSONP GET `a=log&cls&name&list&title&date&total&heard(번호 목록)`, 단어장을 다 들으면 바로, 페이지 닫을 때 `sendBeacon`(POST JSON), 실패하면 30초 뒤·`online` 때 다시. "선생님께 전해졌어요"는 시트가 ok로 답한 뒤에만.

구글 Apps Script (`SCRIPT`, 선생님 시트에 붙여 넣어 '웹 앱'으로 배포: 실행 = 나, 액세스 = 모든 사용자)
- `a=log`(누구나): 탭 `듣기 기록`에 반·학생·단어장마다 한 줄. 들은 번호는 합집합. 칸 서식 `@`(글자)로 저장해 날짜·숫자 자동 변환 막음. `LockService`.
- `a=ping`, `a=read`: KEY가 맞을 때만 (ping은 시트 주소도 돌려줌). JSONP 콜백 이름 검사.
- 열: 반 · 학생 · 단어장 파일 · 단어장 제목 · 숙제 날짜 · 들은 단어 수 · 전체 단어 수 · 들은 번호 · 처음 들은 때 · 마지막으로 들은 때 (Asia/Seoul).
- 스크립트를 고치면 Apps Script에서 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 반영(URL 그대로). 앱의 '스크립트 복사'는 연결된 뒤에는 같은 KEY를 넣어 준다.

선생님 앱 표
- 최근 단어장 3개(예약해서 아직 안 보이는 것 제외) × 이름 목록. 칸: ✓ 다 들음(n/N · 마지막 시각) / ◐ n/N / – 안 들음 / · 기록 전(연결한 날보다 앞선 지난 단어장의 빈 칸). 지금 보이는 단어장은 요약 줄(다 들음·듣는 중·안 들음 n명).

고친 버그(이번에 만들면서)
- 저장된 번호가 없을 때 `"".split(",")` → `[0]`으로 읽혀 1번 단어가 들은 것으로 표시되던 것 → 빈 글자 걸러냄.
- 이름 창이 휴대폰에서 오른쪽으로 넘침 → `.pin` 안 grid `minmax(0,1fr)`.
- 창을 열 때 첫 이름에 테두리가 생겨 이미 골라진 것처럼 보임 → 창 자체에 포커스.

### v=22 (11-11) s + p/t/k로 시작하는 단어의 첫 s에 섞인 목소리 빼기 (spice가 "It's bice"처럼 들리던 문제)
커밋: Words-Practice `30bd4c0`

| 파일 | 바뀐 부분 |
|---|---|
| `app/audio.js` | `S_ONSET = /^[ˈˌ]?s[ptk]/`, `highpass()`(6차 버터워스 = biquad 3단, 앞으로·뒤로 한 번씩), `clearSOnset(a)`: 소리 시작 ~ p/t/k 앞 조용한 틈(시작 후 30~250ms 중 가장 조용한 곳, 앞 최고보다 10dB 이상 낮을 때만)까지 2.5kHz 고역통과 후 10ms 섞어 잇기 |
| `app/engine.js` | `synth()`: 발음 기호가 `S_ONSET`이면 `A.clearSOnset(a)` (자동 시도·다른 소리 고르기·다른 발음 모두 거침) |
| `tools/wordvoice.py` | `clear_s_onset()` 같은 계산(JS와 차이 3e-8), `synth()`에 적용 |
| `Words-Books/drafts/e4b-2026-11-13-….json` | 초4-도하 준비해 둔 "unit.11 뜻"의 spice 소리만 새로 만든 것으로 교체 |

시험: 16단어 음성인식 맞음 17/32 → 30/32, spice 6가지 읽기 모두 맞음, 나빠진 단어 없음. 이미 올린 단어장의 s+p/t/k 단어 45개(7개 반)는 옛 소리 그대로.

### v=21 (11-09) used to 발음 + 초5-혜리 두 번째 단어장 교체
커밋: Words-Practice `5b19f45`, Words-Books `b5340ef`(LS2 추가) → `3079c92`(LS2 빼고 BR250 추가)

| 파일 | 바뀐 부분 |
|---|---|
| `app/g2p.js` `phrase()` | `used` 바로 뒤가 `to`면 과거형(VBD) 발음 `jˈust` (사전 기본은 `jˈuzd`). be used to·get used to도 |
| `Words-Books/books/bricks-reading-250-2.json` (새) | Bricks Reading 250 Level 2, Unit 1~20 × 20 = 400단어 (PDF). 원본 오타 Unit 5 "for exmaple" → for example (`fixes`) |
| `Words-Books/books/listening-season-2.json` | 지움 (선생님 요청, 올리거나 준비한 것 없었음) |
| `Words-Books/books/index.json` | `classes.e5b = ["bricks-voca-2300", "bricks-reading-250-2"]`, `short` 이름들 |
| `tools/bricks_reading_pdf.py` (새 도구) | Bricks Reading Word List PDF → 단어장 JSON (굵은 글씨 = 단어, 같은 줄 보통 글씨 = 뜻, 쪽마다 왼쪽 단 → 오른쪽 단) |

### v=20 (11-09) 단어장이 2개인 반
커밋: Words-Practice `0dead98`

| 파일 | 바뀐 부분 |
|---|---|
| `app/app.js` | `lastRanges/saveLastRange/lastRangeOf`: 지난번 범위를 반·단어장마다(`반코드|단어장id`) 기억 + 반마다 마지막에 쓴 단어장(`반코드|book`) 먼저 고름. `bookShort/titleFor`: 단어장이 2개 이상인 반은 다음 시험 칸을 "Bricks 2300 - unit 1"처럼 단어장 짧은 이름을 붙여 채움 (같은 날짜에 두 단어장의 같은 범위가 겹쳐 덮어쓰지 않게). 다음 시험 칸이 비어 있으면 가져오기 때 다시 채움 |

---

## 3. 버전 기록 (예전)

| 버전 | 날짜 | 내용 |
|---|---|---|
| v=10 | 10-30 | 소리가 틀릴 때 다른 읽기 자동 시도 + 선생님이 6가지 중 고르기 (`app/fixes.json`에 기억) |
| v=11 | 11-01 | 불러온 단어장의 제목을 바꾸면 바꿀지·새로 추가할지 묻기 |
| v=12 | 11-01 | 단어장에서 가져오기 (범위 글자 → 단어·뜻, `books.js` `resolveRange`) |
| v=13 | 11-02 | 올린 뒤 카드에 반 주소 QR + QR 저장 |
| v=14 | 11-03 | 이름을 들어Voca로 (선생님 앱·학생 페이지) |
| v=15 | 11-03 | 잘못 올린 단어장 지우기 |
| v=16 | 11-03 | 준비해 둔 단어장(drafts) + 예약해서 올리기(`next: {at, data}` 사슬) |
| v=17·18 | 11-03 | 날짜 = 숙제 날짜, "제목" 칸 → "다음 시험" |
| v=19 | 11-06 | o'clock: 사전 발음(어클락) 기본 + "오클락(또박또박)" 고르기 (`g2p.js` EXTRA alt) |
| v=20~23 | 11-09~13 | 위 2번 |

자세한 설계 기록은 `tools/DESIGN.md`.

---

## 4. 남은 일·확인할 것

1. **실제 학생 기록이 시트에 쌓이는지**: 구글 시트 연결(11-13 21:13)과 학생 페이지→시트 연결은 확인함(쓰기 없이). 첫 학생 기록이 들어온 뒤 선생님 앱 표에 잘 나오는지 볼 것.
2. 나머지 반(초2-Anna, 초5-다엘, 초6-준서, 초6-민우, 초6-한결, 중1-준호, 중1-태민, 중2-정엽, 중2-준현)은 학생 이름이 없어서 기록이 꺼져 있음 → 선생님 앱 "이름 넣기"로 추가하면 됨(코드 수정 필요 없음). 주의: 이 반들의 기존 페이지는 옛 틀이다. 이름을 넣은 뒤 그 반에 새 단어장을 올리면 반 주소는 새 틀로 다시 만들어지지만, 지난 '이 단어장만' 주소들은 옛 틀로 남는다 → 필요하면 새 틀(`app/student.html`)에 기존 DATA 줄을 글자 그대로 넣어 다시 만든다(11-13에 5개 반 38쪽을 이렇게 함: og:title·og:description·og:url·title 은 기존 페이지에서 읽어 넣음).
3. **finish 발음**(11-09 신고): 첫 f 뒤 ɪ(fish, fin, finish)가 v/th처럼 들리는 Kokoro 문제. 조사만 하고 고치지 않음(선생님이 중단). 선생님은 그때 "period-fast"를 골라 둠(`app/fixes.json`).
4. 이미 올린 단어장의 s+p/t/k 단어 45개는 v=22 전 소리. 선생님이 원하면 다시 만들기.
5. 초3-Gia 반 "Issac"은 선생님이 준 철자 그대로(보통 Isaac) — 선생님 확인 필요.

---
