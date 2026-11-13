> 이 문서는 Claude 프로젝트 "수업 지원 웹앱 제작"의 `wordbook/README.md` 를 2026-11-13에 옮긴 것이에요. 글 안의 `wordbook/` 폴더 = 이 저장소의 `tools/` 폴더. 앞으로는 이 저장소의 `tools/` 가 원본이에요.

# 영어 단어장 발음 링크 만들기

학생이 카카오톡 링크(또는 QR)를 열면 그 반의 최신 단어 목록이 뜻과 함께 보이고, 단어를 누르면 AI가 정확한 미국식 발음으로 읽어 주는 페이지. 로그인 없음, 학습 기록 수집 없음. 반이 여러 개(초2A~초6C, 추가 가능)이고 반마다 단어 목록이 다르다.


## 날짜의 뜻 (2026-11-03 선생님 확인)

- 단어장 날짜는 **숙제 내는 날짜** (시험 날짜 아님). 앱 입력칸 이름 "숙제 날짜". 세 번째 칸(전에는 "제목")은 **"다음 시험"** (v=18, 예: Day 8, unit.5, 4회 21~30번). 비워 두면 미리 채우지 않고, 올릴 때 "○월 ○일 영어 단어"로 들어감. 학생 페이지에는 이 값이 단어장 제목으로 나옴. 반 주소 맨 위 = 숙제 날짜가 가장 늦은 단어장 = 지금 숙제.
- 다음 수업용으로 미리 만든 단어장은 "준비해 둔 단어장"에 두고, 숙제 낼 때 올리기(또는 예약). 2026-11-03 밤 선생님이 11월 4일 숙제 단어장 5개(Gia unit.5, Luna unit.10 11~20번, 동현 4회 31~40번, 도하 unit.9, 준서 Day 10~11)를 준비 목록에 저장 → Claude 가 학생 페이지의 같은 단어장 5개를 지움(앱 지우기와 같은 방식, node 로 site.js buildDeleteFiles 실행), 도하 unit.9 중복 준비본 1개 지움. 그 뒤 초3-Luna 반 주소는 "아직 올라온 단어장이 없어요".

## 이름: 들어Voca (2026-11-03 선생님이 정함)

- "들어 볼까?" + Voca. 선생님 앱과 학생 페이지 모두 이 이름. 코드 상수: `make_site.py` 의 `BRAND`, 앱 `app/site.js` 의 `BRAND` (둘이 같아야 함).
- 선생님 앱: 탭 제목 "들어Voca 선생님", 화면 제목 "들어Voca [선생님]" (teacher.html).
- 학생 페이지: 맨 위 작은 글씨 "들어Voca · 반이름"(template.html `#cls`), 탭·카톡 미리보기 제목 반 페이지 "들어Voca · 반이름", 날짜별 "들어Voca · 반이름 단어장제목". 첫 화면 "들어Voca", 빈 반 페이지 "들어Voca / 반이름 단어장". QR 그림 제목 "들어Voca · 반이름".
- 바꿀 때 이미 올린 모든 날짜별 페이지는 DATA 를 그대로 두고 `make_site.render_student` 로 다시 그렸고(18개), 반 페이지·첫 화면은 `make_site.py --repo` 로 다시 만듦. 초6-민우 반 페이지는 예전 형식(words)에서 새 형식(sets)으로 바뀜 (단어 같음).
- 카톡 공지 문구("다나쌤 다음 단어 시험입니다…")는 선생님이 정한 문구라 그대로. 카톡은 링크 미리보기를 한동안 저장해 두므로, 예전에 보낸 링크는 미리보기에 옛 이름이 보일 수 있음.
- 주소 모음 워드 파일: 들어Voca-주소-모음.docx (앱 주소 + 학생 첫 화면 + 14개 반 주소, 맑은 고딕, 한글-영문 자동 간격 끔).

## 선생님용 웹앱 (기본 방식, 2026-10-29~)

선생님이 원해서 만든 작업 화면: `https://dnteacher.github.io/Words-Practice/teacher.html` (검색 제외, 노트북 크롬/엣지용).
반·날짜 고르기 → 단어와 뜻 붙여넣기 → **발음 만들기** → 단어별 확인표(✓/살펴볼 단어, 뜻에 따른 발음 선택, 미리 듣기) → **올리기**. 채팅 없이 선생님이 직접 한다 (선생님 우선순위: 매번 채팅 > 확인하기 어려움 > 기다리는 시간, 음성인식 검증은 꼭 유지).

- 전부 선생님 브라우저 안에서 돈다 (서버 없음, 비용 없음).
  - 발음 사전: `app/dict-us.json` (misaki us_gold+us_silver), 규칙은 `app/g2p.js` (Python 과 19,022건 비교, 대문자 약어 2건 외 일치). 뜻에 따라 달라지는 단어는 한국어 뜻으로 추측해 미리 고르고 선생님이 바꿀 수 있다. 사전에 없으면 espeak(phonemizer) 로 만들고 "사전에 없는 단어" 표시.
  - AI 음성: transformers.js 3.5.1 + `onnx-community/Kokoro-82M-v1.0-ONNX` fp32, af_heart. 그래픽 가속(WebGPU) 우선, 안 되면 CPU. 노트북에서 단어당 약 2.5초.
  - 빠르기: **보통 하나만** (2026-10-29 선생님 결정, engine.js·build.py 의 `SPEEDS`). 느린 음성 코드(`app/audio.js` 의 WSOLA, Parakeet 로 90단어×3빠르기 전부 통과)는 남겨 두었으니 다시 필요하면 SPEEDS 에 추가하고 template.html 에 빠르기 막대를 되살린다.
  - 음성인식 검증: `onnx-community/whisper-base.en` q8. 8단어씩 묶어 한 번에 받아적고(약 8배 빠름), 맞지 않은 단어만 하나씩 다시 확인. 철자가 아니라 **발음**을 비교 (tear→"tier", read 과거→"red" 도 같은 소리로 통과). 14단어 약 90초.
  - **읽는 방식 (2026-10-30, club 문제)**: Kokoro 가 b·d·g 로 끝나는 짧은 단어 끝에 모음을 붙이는 일이 있다 (club → "Clubbie", 사전 발음 klˈʌb 은 맞음). engine.js `VARIANTS` 소리 1~6 = 그대로 / 끝에 "." / "!" / "," / "." + 0.9배 / "." + 1.1배. 묶음·개별 확인에서 다르게 들리면 `AUTO_TRY`(마침표·느낌표·쉼표) 순서로 다시 만들어 확인하고 통과한 것을 쓴다 ("소리를 자동으로 고쳤어요"). 선생님은 "다른 소리 고르기"/"다른 소리"로 6개를 들어 보고 고를 수 있다. 자동 고침·직접 고른 소리는 올릴 때 저장소 `app/fixes.json` (음소 → 소리 id)에 저장돼 다음부터 바로 그 소리로 만든다 ("예전에 고른 소리"). 직접 "그대로"를 고르면 그 항목을 지운다. b·d·g 끝 단어 27개 시험: 그대로는 club·rub·tub·bed 실패, 마침표가 club·rub·bed 해결, tub 은 6개 모두 음성인식 실패 → 선생님 귀로 판단. "?"(올라가는 억양)와 약한 강세는 결과가 나빠 뺐다. 기본은 여전히 마침표 없이 (knife→knives 문제).
  - MP3: lamejs 1.2.1 (48kbps). QR: qrcode-generator 1.4.4 (설정 → 반 목록 → QR 저장).
  - 처음 열 때 모델 약 430MB 내려받음(브라우저에 저장), 이후 약 10초면 준비.
- **AI 일꾼 (2026-10-30)**: Kokoro·Whisper 는 `app/worker.js` (module Web Worker) 안에서 돈다. 화면 쪽 engine.js 는 메시지로 요청만 한다. 이전에는 화면 쪽에서 돌려 그래픽 가속이 없는 선생님 크롬에서 "페이지가 응답하지 않습니다"가 계속 떴다. 일꾼으로 옮긴 뒤 화면 멈춤 최대 0.14초. 속도는 같다 (CPU 기준 짧은 단어 약 2.5~3초, 긴 구는 더 걸림, 30단어 약 3~4분). 그래픽 가속이 없으면 앱이 크롬 설정(시스템 → 가능한 경우 그래픽 가속 사용) 안내를 보여 준다. 시험용으로 localStorage `wp-force-wasm`=1 이면 그래픽 가속을 끄고 돈다. 더 빠르게 하려면 coi-serviceworker(범위 /Words-Practice/teacher)로 cross-origin isolation 을 켜 WASM 멀티스레드를 쓰는 방법이 있다 (아직 안 함).
- **같은 날 여러 단어장 (2026-10-30)**: 올릴 때 같은 반·같은 날짜에 같은 제목이 있으면 바꿀지 묻고, 제목이 다르면 새 단어장으로 추가(-2, -3). "지난 단어장 고치기"로 불러온 단어장은 날짜가 같으면 제목을 바꿔도 그 파일을 고친다(app.js `editing`). 올린 뒤에는 `editing` 을 비워 다음 올리기가 조용히 덮어쓰지 않게 했다. **2026-11-01 고침 (v=11)**: 선생님이 Day 6 을 불러온 화면에 Day 7 을 넣어 올려 Day 6 이 바뀐 일이 있어서, 불러오면 "○○ 단어장을 고치는 중" 안내 줄(`#editBar`, "고치지 않고 새 단어장으로 만들기" 버튼)을 보여 주고, 불러온 단어장의 제목을 바꿔 올리면 "그대로 두고 새로 추가 / 대신 바꾸기"를 묻는다 (app.js setEditing, askChoice). 날짜를 바꾸면 고치는 중 상태를 푼다. 같은 날짜 단어장 순서는 처음 올린 파일 순서(-1, -2…)라서 바뀐 자리에 들어간 단어장은 앞에 나온다. 반 페이지 DATA 는 `sets:[{href,title,words}]` + `past:[{href,title,n,date}]` (예전 형식 words 하나도 읽음: site.js setsOf). Python make_site 도 같은 구조로 만들고(현재 template.html 로 그림, pick_name 으로 -2 이름), 앱 결과와 같은 반 페이지가 나오는 것을 확인함.
- 올리기: GitHub fine-grained 토큰(Words-Practice 만, Contents: Read and write)을 앱 설정에 넣으면 Git Data API 로 날짜별 페이지 + 반 페이지를 커밋 하나로 올린다. 토큰은 그 브라우저 localStorage 에만 저장.
- 올린 뒤 카드 (2026-11-02, v=13): 오른쪽에 그 반 주소 QR코드(화면용 작은 그림, app.js qrBox)와 **QR 저장** 버튼 (설정의 QR 저장과 같은 큰 그림: 반 이름 + QR + 안내 문구, `반이름-QR.png`). 좁은 화면에서는 아래로 내려감. 두 QR 모두 반 주소로 읽히는 것 확인.
- **준비해 둔 단어장 (2026-11-03, v=16)**: 아래 막대 **저장해 두기** → 비공개 저장소 Words-Books `drafts/index.json` ({drafts:[{id, cls, date, title, n, saved}]}) + `drafts/<id>.json` ({id, cls, date, title, words:[{w,m,a(mp3)}], fixes, saved}). 맨 위 "준비해 둔 단어장" 카드(#draftCard, 있을 때만): 학생 화면 미리 보기 / 고치기(단어를 불러와 발음 다시 만들기 → 저장해 두기면 같은 id 덮어씀, #editBar 에 안내) / 지우기(파일 삭제: Git Data API tree 에 sha:null) / 올리기(바로·예약 고르고 올림 → fixes 를 fixes.json 에 합치고, 올린 뒤 준비 목록에서 뺌). 같은 날짜·제목이 있거나 날짜가 앞서면 경고 후 "그래도 올리기".
- **학생에게 보이기 예약 (2026-11-03, v=16)**: 아래 막대·준비 단어장 올리기에 "올리면 바로 / 정한 때부터 [날짜][시각]" (app.js makeSched, 시각은 +09:00 로 저장, 마지막 시각 기억 `wp-show-time`). 날짜별 페이지 DATA.showFrom. 반 페이지는 지금 보일 것 + `DATA.next = {at, data}` 사슬(그때의 반 페이지 전체, 소리 포함) — site.js `_classFromEntries` / make_site `class_data_timeline` 같은 규칙(하네스로 같음 확인). template.html 이 열 때 기기 시계로 사슬을 따라가 보일 것을 고르고, 열어 둔 채로 그 시각이 되면 새로고침. 예약 중인 반 페이지의 카톡 미리보기 설명은 "단어를 누르면 발음이 나와요"(최신 제목이 낡지 않게). 예약 단어장만 있고 아직 보일 게 없으면 "아직 올라온 단어장이 없어요". 지난 단어장 목록에 "⏰ …부터 보임", **지금 바로 보이기**(site.js buildShowNowFiles), 예약한 단어장을 불러와 고치면 예약 유지. 반 주소 맨 위는 여전히 날짜가 가장 늦은 단어장이라, 새 단어장 날짜가 (그 시각에) 보이는 단어장보다 앞이면 올리기 전에 경고(laterListAt). 날짜별 주소("이 단어장만")는 예약 전에도 열림.
- **발음만 두 가지인 단어 (2026-11-06, v=19)**: g2p.js `EXTRA` 에 `alt: true` 항목 — 뜻은 같고 발음만 다른 단어. 첫 번째(사전 발음)가 기본, 단어 옆 발음 고르기에서 두 번째를 고름("발음을 고를 수 있어요" 표시). 지금은 o'clock 하나: "어클락 (사전 발음)" əklˈɑk / "오클락 (또박또박)" ˌOklˈɑk. 선생님이 "o'clock 발음이 틀리다"고 해서 확인: 미국 사전 /əˈklɑk/ (Merriam-Webster ə-ˈkläk, vocabulary.com US /əˈklɑk/, UK /əʊˈklɒk/), 앱 소리는 사전대로였음. 철자 시험이라 "a clock"으로 쓸 걱정 → 선생님이 "기본은 사전 발음, 오클락은 고를 수 있게"(1번) 선택. ˈO 강세 없는 "Oklˈɑk"은 Parakeet "Black"/Whisper "A lot"으로 들려서 ˌO 를 붙임 (Whisper "O'clock.", Parakeet "Oh clack"). "다른 소리 고르기"(소리 1~6)는 끝맺음·빠르기만 바꾸고 모음은 안 바꾼다.
- **s + p/t/k 로 시작하는 단어 (2026-11-11, v=22, spice)**: Kokoro 가 첫 s 에 목소리를 섞어 spice 를 "It's bice / is buys"처럼 읽음 (6가지 읽기 모두; 사전 발음 spˈIs 은 맞음). 고침: `audio.js` `clearSOnset` — 발음 기호가 `^[ˈˌ]?s[ptk]` 이면 소리 시작 ~ p/t/k 앞 조용한 틈(시작 후 30~250ms 중 가장 조용한 곳, 앞 최고보다 10dB 이상 낮을 때만)까지 2.5kHz 고역통과(6차 버터워스 앞뒤 두 번) 후 10ms 섞어 잇기. `engine.synth` 에서 모든 소리에 적용 (자동 시도·다른 소리 고르기·다른 발음 포함). `wordvoice.py` `clear_s_onset` 이 같은 계산 (JS 와 차이 3e-8). 시험 (Parakeet·Whisper base.en): 16단어 맞음 17/32 → 30/32, spice 6가지 읽기 0~2/6 → 6/6, 나빠진 단어 없음 (sm·sn·sl·sw 는 대상 아님). 초4-도하 준비해 둔 "unit.11 뜻"의 spice 소리는 저장소에서 직접 바꿈. 이미 올린 단어장의 s+p/t/k 단어 45개(7개 반)는 옛 소리 그대로 (선생님이 원하면 바꾸기).
- **단어장 지우기 (2026-11-03, v=15)**: "지난 단어장 고치기" 옆 **지우기** → 확인(빨간 지우기 버튼) → site.js `buildDeleteFiles`: 반 페이지에서 빼고 `_classFromEntries` 로 다시 만듦(최신이 지워지면 다음 날짜가 최신, 하나도 없으면 빈 반 페이지). 지운 날짜별 파일은 지우지 않고 반 주소로 넘기는 안내 페이지(`wp-redirect`, "지운 단어장이에요")로 바꿈 → 예전 링크도 반 단어장으로. Python make_site 는 안내 페이지를 건너뛰므로 같은 반 페이지가 나옴(하네스에서 확인). 같은 날짜에 다시 올리면 -2 이름을 씀. **되살리기**: `git show <지운 커밋>^:<파일> > <파일>` 로 날짜별 파일을 되돌린 뒤 `make_site.py --repo` 로 반 페이지 다시 만들기.
- 카톡 공지 문구 (선생님 지정, 2026-10-30 수정): 올리기 뒤 "카톡 공지 문구 복사"는 `다나쌤 다음 단어 시험입니다.` / `아래 링크에 접속해서 발음을 들어보며 공부하세요.` / `(반 주소)` 세 줄 (app.js showDone).
- 반 추가·이름 바꾸기·목록에서 빼기도 앱 설정에서 (2026-10-30 이름 바꾸기/빼기 추가). 이름 바꾸기는 주소 코드는 그대로 두고 classes.json·index.html·그 반 페이지·그 반 날짜별 페이지 전부를 새 틀로 다시 만들어 한 커밋으로 올린다. 빼기는 classes.json·index.html 에서만 빼고 페이지는 남긴다 (예전 주소 계속 열림). 같은 코드로 다시 추가하면 기존 반 페이지(단어장 목록)를 이어 쓴다. **주소 바꾸기**(2026-10-30): 그 반의 반 페이지·날짜별 페이지를 새 코드로 옮기고(DATA.cls_code·home·past href 갱신), 옛 파일은 이동 안내 페이지(`<meta name="wp-redirect" content="새주소">` + meta refresh + location.replace)로 바꾼다. 다른 반으로 넘겨 주는 옛 주소는 새 반이 가져갈 수 없다 (같은 반이 자기 옛 주소로 돌아가는 것만 허용). 반 추가도 이동 안내 페이지 자리는 거절. Python make_site 는 classes.json 에 없는 코드의 파일(안내 페이지)을 건드리지 않는다. 앱의 GitHub 올리기 흐름은 하네스(가짜 GitHub API, 저장소 사본)로 시험한다: scratchpad/harness/harness3.py 참고. **저장소의 `classes.json` 이 반 목록의 기준**이다 (Python 도구도 저장소 것을 먼저 읽음).
- 앱이 만드는 페이지는 Python make_site.py 결과와 같은 구조 (`app/student.html`, `app/list-page.html` 틀은 `export_app_templates.py <저장소>` 로 Python 틀에서 만든다. template.html·make_site.py 디자인을 바꾸면 다시 실행).
- 앱 파일을 고칠 때: 저장소 `teacher.html`, `app/*.js` 수정 → 버전 꼬리표 `?v=N` 을 teacher.html 과 app/*.js 의 import, dict 주소, engine.js 의 worker.js 주소에서 모두 하나 올린다 (현재 v=23) (GitHub Pages 캐시 10분 때문) → push. 시험은 선생님 컴퓨터의 내장 브라우저(dnteacher.github.io 허용됨)에서. 이 작업 환경은 jsDelivr·Hugging Face 에 접속할 수 없어 모델 시험을 여기서 못 한다. Git Data API 쓰기도 이 환경의 프록시가 막아서, 업로드 시험은 선생님 토큰으로 브라우저에서 해야 한다.
- 2026-10-29 확인: 선생님 노트북(4코어, WebGPU)에서 14단어 생성·검증 90초, 동형이음어 추측 5/5, 오타(libary) 경고, 사전 밖 단어(Pikachu) 생성, 미리 보기 페이지 MP3 재생 확인. 같은 날 선생님이 토큰을 넣고 초6B반 10월 30일 단어장(16단어)을 앱으로 올림 → 업로드 동작 확인.

## 누가 들었나요? (2026-11-13, v=23)
선생님 요청: 반별 카톡방에 공유한 단어장을 누가 들었는지 확인. 시안 미리보기6·7 확인 후 만듦. 먼저 5개 반: 초3-Gia(e3a) 7명, 초3-Luna(e3b) 3명, 초4-동현(e4a) 2명, 초4-도하(e4b) 6명, 초5-혜리(e5b) 5명.
- **학생 화면** (`template.html` → `app/student.html`): 같은 폴더의 `listen.json` 에 이 반 이름과 구글 시트 주소(url)가 있을 때만 켜진다. 처음 열면 아래에서 "누가 듣나요?" 창(영어 이름 버튼, "내 이름이 없어요"로 건너뛰기) → 이름은 이 휴대폰 localStorage(`dv-name:반코드`)에 기억. **끝까지 재생된 단어만**(audio `ended`) ✓ 와 함께 '들음'(`dv-heard:반:이름:단어장파일`), 위 카드에 "들은 단어 n / N", 다 들으면 "✓ 다 들었어요! 선생님께 전해졌어요"(구글 시트가 받았다고 답한 뒤에만). 보내기: 1.5초 모아서 JSONP GET(`a=log`), 단어장을 다 들으면 바로, 페이지를 닫을 때 sendBeacon(POST), 실패하면 30초 뒤·인터넷 연결 때 다시. 단어장 구분 = 날짜별 파일 이름(반 페이지의 sets[].href, 날짜별 페이지는 주소의 파일 이름) → 반 주소와 '이 단어장만' 주소의 기록이 이어진다. 미리 보기(blob:)와 이름 없는 반은 꺼짐.
- **구글 시트** (`app/listen.js` 의 SCRIPT): 선생님 구글 시트의 Apps Script 웹 앱 (실행: 나, 액세스: 모든 사용자). `a=log` 는 누구나(반·학생·단어장마다 한 줄, 들은 번호는 합침, 글자 서식 "@"로 저장해 날짜·숫자 자동 변환 막음, LockService), `a=read`·`a=ping` 은 KEY 가 맞을 때만. 탭 이름 '듣기 기록', 열: 반·학생·단어장 파일·제목·숙제 날짜·들은 단어 수·전체·들은 번호·처음·마지막(Asia/Seoul). 열쇠(KEY)는 선생님 앱이 '스크립트 복사' 때 만들어 스크립트에 넣는다 (Claude 는 모름).
- **파일**: `Words-Books/students.json`(비공개, 한글+영어 이름), `Words-Books/listen.json`(비공개, url·key·sheet·saved), `Words-Practice/listen.json`(공개, url + 영어 이름만. 한글 이름·열쇠 없음). 연결 전에는 url "" → 학생 화면 그대로.
- **선생님 앱** (`app/listen-ui.js`): 맨 위 '누가 들었나요?' 카드 — 반 고르기(이름 있는 반 먼저), 최근 단어장 3개(예약해서 아직 안 보이는 것 빼고) × 학생 표: ✓ 다 들음 / ◐ n/N / – 안 들음 (+ 마지막으로 들은 때), 연결한 날보다 앞선 지난 단어장의 빈 칸은 '· 기록 전'. 지금 보이는 단어장 요약 줄. '이름 고치기'(한 줄에 한 명 "홍길동 Tom", 같은 반 영어 이름 중복·영어 이름 없음은 오류) → 비공개·공개 파일 저장. 설정 '듣기 기록 — 구글 시트 연결': 6단계 안내, 스크립트 복사(같은 열쇠 유지), 웹 앱 URL 붙여넣기 → ping 확인 → 저장, '학생 페이지에서 기록 끄기'.
- 시험: 스크립트를 Node 의 가짜 시트로 돌림(합치기·잘못된 번호·글자 유지·열쇠·1000줄 넘음), 가짜 GitHub+가짜 웹 앱으로 선생님 앱 전체 흐름(이름 저장·연결·학생 두 명 듣기·표·구글 시트 끊김·새 단어장 올리기·끄기), 학생 화면 320/390/1024px. 진짜 구글 Apps Script 는 선생님이 배포한 뒤 확인해야 함.
- 5개 반의 기존 페이지 38개를 새 틀로 다시 만듦 (DATA 그대로, 예약 기능 전 옛 틀 3개 포함). 다른 반은 다음에 올릴 때 새 틀이 들어감 (이름이 없으면 예전과 같음).
- 학생 이름 메모: e3a 의 "Issac" 은 선생님이 준 철자 그대로.

## 단어장에서 가져오기 (2026-11-01 앱에 넣음, v=12)

- 화면: "1 반과 날짜" 안의 "단어장에서 가져오기" (teacher.html `#bookBox`). 반을 고르면 그 반 단어장(앞이 지금 쓰는 것, 아래 "다른 반 단어장" 묶음)이 나오고, 시험 범위를 적고 가져오기(또는 Enter) → 2번 칸에 `단어<탭>뜻` 줄로 들어감. 제목이 손대지 않은 상태면 범위 글자로 넣음. 2번 칸에 다른 단어가 있으면 바꿀지 물음. 지난번 범위는 반·단어장마다 기억해 입력칸 안내 글자로 보여 주고(localStorage `wp-last-range`, 키 `반코드|단어장id`, 반마다 마지막에 쓴 단어장 `반코드|book` 도 기억해 다음에 먼저 골라 둠), 다음 시험 칸이 비어 있어도 다시 채움. **단어장이 2개 이상 연결된 반**(v=20, 초5-혜리)은 다음 시험 칸에 단어장 짧은 이름을 붙임: "Bricks 2300 - unit 1", "Bricks Reading 250 - unit 1" (index.json `short`). 같은 숙제 날짜에 두 단어장의 같은 범위를 올려도 제목이 달라 덮어쓰지 않고, 반 주소에 "단어장 2개"로 차례로 나옴 (같은 날짜 + 같은 제목 = 바꾸기, 제목이 다르면 여러 개). 단어장이 1개인 반은 전처럼 범위 글자만. 60개 넘으면 나눠 달라고 함.
- 데이터: 같은 열쇠로 비공개 저장소 Words-Books 의 `books/index.json`·`books/<id>.json` 을 읽음 (app/books.js `Books`, site.js `GitHub.other(repo)`). 열쇠에 저장소가 없으면 안내. 열쇠가 없는 브라우저는 "설정에서 열쇠를 넣으면…" 안내.
- 범위 글자: app/books.js `resolveRange` (= wordbook/wordrange.py 와 같은 규칙). "Day 8", "Day 8 1~10번", "Day 21 14"(한 개), "Day 7 121~123"(책 번호), "Day 7~8", "4회 11~20번", "4회 11-20", "1~2회", "unit.5", "u5", "UNIT 05", "unit 5~6". 없는 범위 → "이 단어장에는 ‘Day 31’ 범위가 없어요. 있는 범위: …".
- 설정 → 반 목록: 반마다 "단어장" 고르기 → Words-Books `books/index.json` 에 커밋 (고른 것을 맨 앞으로, "연결 안 함"이면 그 반 항목 삭제).
- 줄 나누기(parse): 탭이 있으면 탭에서 단어·뜻을 나눔 (엑셀 붙여넣기도 같음). 그래서 "How about ~ing ?" 같은 표현이 단어 칸에 그대로 남음.
- 소리: g2p.js `speakable` 로 기호를 빼고 읽음 (~xxx, [..], (..), ?!., "/"·"↔" 는 쉼표). 화면·학생 페이지에는 적힌 그대로. 품사(가져온 단어만, posKey 로 기억·임시 저장에 포함): guessVariant 에 pos 하나가 있으면 그 품사 발음, 없으면 기본 발음 (뜻이 과거형이면 뜻을 따름). 예: tear v.→tɛr, live v.→lɪv, close v.→kloʊz, read v. 읽다→riːd, record n.→기본.
- 시험: harness8.py/harness9.py (가짜 GitHub 에 두 저장소). 실제 모델 확인 (내장 브라우저, 2026-11-01): "How about ~ing ?", "there is[are]", "can ↔ can't" 모두 음성인식 확인됨.

## 단어장 파일 정리 (2026-11-01)

- 선생님 요청: 반마다 단어장 파일을 미리 넣어 두고, 시험 범위만 적으면 단어·뜻이 자동 입력되게. 단어장은 양식·파일 형식이 다 다름.
- 정한 것 (선생님 답): 시험 범위는 그때그때 글자로 입력("4회 11~20번", "unit.5", "Day 7"). 뜻은 품사 표시(n. v. adj. …)를 빼고 품사가 여러 개면 " / " 로 나눔 (선생님이 Bricks unit.5 를 손으로 고친 방식과 같음), 예문·발음기호 뺌. 단어장 정리본은 **비공개 저장소**에 두고 앱이 선생님 열쇠로 읽기 (공개 저장소에 책 전체를 두지 않음 — 저작권).
- 방식: Claude 가 파일을 한 번 읽어 {book, sections:[{name, items:[{no, w, m}]}]} JSON 으로 정리 → 앱은 반을 고르고 범위를 적으면 정리본에서 꺼내 입력 (AI 호출·비용 없음). 품사는 화면에서 빼되 발음 고르기(record n./v. 등)에 쓰도록 따로 둔다.
- 도구: `hwpx2grid.py` (HWPX: zip 안 Contents/section*.xml 의 표·문단), `bricks_reading_pdf.py` (Bricks Reading Word List PDF: 굵은 글씨 단어 + 같은 줄 뜻, pdfplumber), `hwp2grid.py` (HWP 5.0 본문·표를 칸 위치까지 꺼냄, olefile 은 GitHub decalage2/olefile 클론, PyPI 막힘), `wordrange.py` (정리본 + 범위 글자 → 단어·뜻, 시험용 Python 원형. 앱에는 JS 로 옮겨야 함). xlsx 는 openpyxl.
- 받은 파일 시험 (2026-11-01):
  - 능률 초등영어 듣기모의고사 10회 4-1 (.hwp, 회마다 2단 표 1~59번): 10회 535단어. 4회 11~20번이 초4-동현이 올린 단어장과 10개 모두 같음.
  - Bricks Vocabulary 3100 Word List Type A (.xlsx, 쪽마다 UNIT 2개 나란히): 30 UNIT × 25 = 750단어. UNIT 05 를 규칙대로 정리하면 초6-한결이 올린 unit.5 와 25개 중 24개 같음 (나머지 1개는 원본 띄어쓰기 "손 글씨"). Sheet2 는 UNIT 30 사본.
  - 원본 오타: 듣기모의고사 2회 4번 chid(아이) → child, Bricks UNIT 08 diffculty → difficulty. chid 는 사전에 있는 낱말이라 앱 사전 검사로 못 잡음.
  - 특수 표기: let's ~, there is[are], blond(e), How about ~?, o'clock. 지금 앱의 줄 나누기(parse)는 "~"·"["·"(" 에서 영어가 끝난다고 봐서 뜻 칸이 틀어짐 (예: 초4-도하 unit.8 "How about | ~ing ? (ing) 하는 게 어때?"). 자동 입력은 단어·뜻을 따로 넘기고, 소리는 기호를 빼고 읽게 해야 함.
- **정리본 보관 (2026-11-01)**: 비공개 저장소 `github.com/DNTeacher/Words-Books` (선생님이 만듦, README 있음, 선생님 열쇠 2개(노트북1·노트북2)와 Claude GitHub 앱에 추가됨, Claude 가 push 확인) 의 `books/`. 사본: 프로젝트 문서 `wordbook/books/<id>.json` ({id, book, source, made, classes, fixes, notes, sections:[{name, items:[{no, w, m, pos?}]}]}). w·m 은 정리 규칙을 이미 적용한 값 (따옴표 곧게, "* 덧붙임" 뺌, 품사 표시 빼고 " / "). `books/index.json` = 반 코드 → 단어장 id.
- **반 ↔ 단어장 (2026-11-01 선생님이 알려 줌, 파일 6개 받음)**: e3a 초3-Gia = The Best Reading 2.3 (pptx, Unit 1~12, 163) · e3b 초3-Luna = Read It! 50-3 (docx, Unit 1~16, 329, 품사 칸) · e4a 초4-동현 = 능률 듣기모의고사 10회 4-1 (hwp, 1회~10회, 535) · e4b 초4-도하 = Listening Season 1 2nd ed. (.doc → LibreOffice 로 docx 변환, Unit 1~12, 317; 원본에 Unit 10~12 는 15개씩만) · e6a 초6-준서 = 중1 동아(윤정미) Grammar Build Up 영단어장 (hwpx, 학원 자체 제작, Day 1~30 × 20 = 600, 번호가 1~600 이어짐, 품사·예문 칸; 예문은 뺌, 동사 과거형 괄호는 뜻에 남김) · e6c 초6-한결 = Bricks Vocabulary 3100 (xlsx, UNIT 01~30, 750). · **e5b 초5-혜리 = Bricks Vocabulary 2300** (xlsx, 3100 과 같은 양식, UNIT 01~30 × 25 = 750, 2026-11-04 추가; 원본 오타 없음, hometown 은 사전 밖이라 espeak; close·object 는 뜻 칸에 두 품사(소리 다름)가 있어 앞 뜻 기준으로 고름). · **e5b 초5-혜리 두 번째 = Bricks Reading 250 Level 2** (PDF, Unit 1~20 × 20 = 400, 2026-11-09 추가 — 같은 날 먼저 넣었던 Listening Season 2 는 선생님 요청으로 지움, 올리거나 준비해 둔 것 없었음). PDF 는 쪽마다 2단, 단어 줄 "• neat 멋진, 훌륭한"(단어는 굵은 색 글씨), 영어 풀이·예문·번역은 뺌, 순서는 쪽마다 왼쪽 단 위→아래 다음 오른쪽 단. `bricks_reading_pdf.py` 로 만듦 (다른 Bricks Reading 레벨도 같은 양식이면 그대로 쓰면 됨). 원본 오타 Unit 5 20번 "for exmaple" → for example 로 고침, 뜻 끝 마침표 뺌. 원본 뜻 그대로 둔 것: ceiling "천정"(표준어는 천장), heard of(원형은 hear of), neat "정돈되다"·lovely "사랑스럽다". 소리가 둘인 단어는 뜻으로 맞게 골라짐: close 가까운 /kloʊs/, present 현재, subject 주제, project 과제, object 물건(명사), affect·graduate(동사), row 배를 젓다 /roʊ/. used to 가 /juːzd/ 로 나와서 g2p.js phrase() 에 "used 바로 뒤 to → 과거형 /juːst/" 규칙을 넣음 (v=21, misaki 와 같은 규칙, be used to·get used to 도). 혜리 반 단어장 2개: index.json classes.e5b = [bricks-voca-2300, bricks-reading-250-2].
- 이미 올린 단어장과 대조: 초4-동현 4회 11~20번 10/10, 초6-준서 Day 6 20/20·Day 7 20/20, 초6-한결 unit.5 24/25 (원본 띄어쓰기), 초4-도하 unit.8 은 단어 24/30 — 다른 6개는 앱의 줄 나누기가 "~"·"/" 표현을 잘못 나눈 것 (파일 쪽이 맞음).
- 고친 원본 오타: 듣기모의고사 2회 4번 chid → child, Bricks UNIT 08 3번 diffculty → difficulty, Read It Unit 16 19번 뜻 "해우다" → "배우다". 사전에 없지만 맞는 말: sandcastle, guesthouse, hanok (앱은 espeak 로 읽음).
- 범위 글자 (wordrange.py): "4회 11~20번", "unit.5", "Unit 30 1-5", "Day 6 1~5번"(그 Day 안에서 몇 번째) 또는 "Day 7 121~123"(책 번호), "1~2회", "unit 5~6". 없는 범위는 "있는 범위: …" 안내.
- 단어장 바꾸기 (선생님과 정한 흐름): 반이 한 단어장을 끝내면 선생님이 "반 + 새 단어장"을 알려 준다. 처음 보는 단어장이면 파일을 함께 받아 정리, 이미 정리된 단어장이면 짝만 바꾼다. 앱에 넣으면 설정에서 "반마다 쓰는 단어장"을 이미 정리된 것 중에서 선생님이 직접 고를 수 있게 하고, 예전 단어장도 지우지 않고 남긴다 (복습 시험·다른 반 사용).
- 앱에 넣을 때 할 일 (비공개 저장소·열쇠·Claude 연결은 끝남): 앱이 Words-Books/books/index.json 과 정리본을 열쇠로 읽기 → 반↔단어장 연결 (books.json) → 범위 입력칸 + 미리 보기 → parse 대신 {word, meaning, pos} 바로 사용. 반↔단어장 짝은 위 목록 (확인됨).

## 검토 중: 다른 선생님과 함께 쓰기 (2026-10-30, 선생님이 더 생각해 보기로 함)

- 학원 구조: 1부·2부·3부 × 각 3개 반, 반마다 1·2교시. 선생님은 1·2·3부 각 2개 반 담당. 함께 쓸 선생님 2명 (총 3명).
- 제안한 방식: 같은 앱 주소, 다른 선생님은 GitHub 가입 없이 dnteacher 계정에서 사람별 fine-grained 토큰(Words-Practice 만)을 받아 사용. 앱에 부·반·교시 구조, "내 반만 보기" 설정, 동시 올리기 시 반 페이지 덮어쓰기 방지(commit 재시도 때 반 페이지를 새로 읽어 다시 만들기) 추가 필요.
- 선생님께 물어본 것 (답 대기): 9개 반 이름과 기존 10개 반(초2A~초6C)과의 연결, 교시마다 선생님·단어 시험이 따로인지, 카톡 숙제방이 반별인지 선생님별인지. 답에 따라 "반 주소 하나에 1교시·2교시 단어장을 같이" 또는 "교시마다 주소 따로".

## 채팅으로 만들기 (예비 방식)

웹앱을 못 쓸 때는 이 프로젝트에서 새 대화를 열고 반 이름을 붙여 단어를 보내면 된다. 여러 반을 한 번에 보내도 된다.

> 초3A반 10월 30일: apple 사과 / read 읽었다 / live 살아 있는 …
> 초5B반 10월 30일: …

단어장 사진을 올려도 된다. GitHub가 Claude에 연결되어 있어서(2026-10-29) Claude가 직접 저장소에 올리고 확인까지 한다. 반 단톡방에는 처음에 그 반 고정 주소(QR)만 한 번 공지하면 된다.

## 사이트 구조 (GitHub Pages)

- 저장소 `github.com/dnteacher/Words-Practice` (공개, main /(root) 배포) → `https://dnteacher.github.io/Words-Practice/`
- 폴더 없이 저장소 맨 위에 파일만 둔다 (손으로 올릴 때 끌어다 놓기만 하면 되게):
  - `index.html` 첫 화면: 반 목록 (반을 추가할 때만 바뀜)
  - `e3a.html` 반 고정 주소: 그 반 **최신 날짜의 단어장 전부**(여러 개면 제목별 구역으로 차례로, DATA.sets) + 아래 "지난 단어장" 목록(날짜 표시, DATA.past 에 date). 단어장이 없으면 "아직 올라온 단어장이 없어요" 안내
  - `e3a-2026-10-30.html` 날짜별 단어장 (아래에 "초3A반 최신 단어장 보기" 링크). 같은 날 제목이 다른 단어장은 `e3a-2026-10-30-2.html`, `-3.html` … (2026-10-30 선생님 결정 A: 반 주소에 그날 단어장 모두 보여 주기)
  - `2026-10-29.html` 첫 예시 단어장 (반 구조 이전, 어디에도 연결 안 됨, 지워도 됨)
- 반 목록: `classes.json` (코드 규칙: 초=e, 중=m + 학년 + 반, 예 초3A반 → e3a). 주소에는 한글을 쓰지 않는다 (카톡에서 링크가 깨져 보임). 화면 제목은 한글 반 이름.
- 매일 올릴 파일: 반마다 2개 (`반코드-날짜.html`, `반코드.html`). 반 추가 시에는 `index.html`과 새 `반코드.html`.
- Claude 링크(artifact)는 단어장마다 공유 설정(Share → Anyone with the link)을 따로 켜야 해서, 반이 많은 지금은 기본으로 만들지 않는다. 선생님이 요청할 때만 만든다.

## Claude 작업 절차

1. **준비**: 프로젝트 `wordbook/` 문서들(setup.sh, wordvoice.py, build.py, make_qr.py, make_site.py, export_app_templates.py, template.html, classes.json, example-set.json, 이 README)을 `project_read`로 받아 한 폴더에 저장하고 `bash setup.sh`. PyPI·npm·Hugging Face가 막힌 세션에서도 GitHub만으로 준비된다.
2. **저장소 받기**: `add_repo(owner=dnteacher, repo=Words-Practice, access=push)` → 결과가 알려 주는 대로 `git clone --depth 1 https://github.com/dnteacher/words-practice /home/claude/words-practice` → `register_repo_root`. 이 폴더를 아래 `--repo`로 쓴다. 이미 올라간 날짜 파일이 있어야 "지난 단어장" 목록이 빠지지 않는다. (add_repo가 "link your GitHub account" 오류를 내면 연결이 끊긴 것: 선생님께 claude.ai/customize/connectors 에서 GitHub 연결, github.com/apps/claude/installations/new 에서 Words-Practice만 선택해 설치를 안내하고, 그동안은 zip 수동 업로드.)
3. **단어장 파일**: 반·날짜마다 `~/wordbook/sets/e3a-2026-10-30.json`
   ```json
   {"class": "e3a", "date": "2026-10-30", "title": "10월 30일 영어 단어",
    "words": [{"word": "apple", "meaning": "사과"},
              {"word": "read", "meaning": "읽었다", "pos": "VBD"}]}
   ```
   `class`는 반 코드(또는 반 이름). 예시로 만들 때만 `"sample": true`.
4. **뜻에 맞는 발음 고르기**: `python3 ~/wordbook/build.py sets/파일.json` → `out/e3a-2026-10-30.html`
   - 뜻에 따라 발음이 다른 단어(read, live, close, wind, tear, present, use, record, lead 등)는 `pos`나 `ipa`가 없으면 생성을 멈추고 후보를 보여 준다. 선생님이 적은 **뜻을 보고** 고른다.
     - `pos`: DEFAULT(사전 기본) / VERB / NOUN / ADJ / VBD(과거) / VBN(과거분사)
     - `ipa`: 사전에 원하는 발음이 없을 때 Kokoro 음소로 직접 지정 (예: lead=납 → `"ipa": "lˈɛd"`). 표기법은 misaki의 EN_PHONES.md.
   - 자동 감지 목록에 없는 동형이음어, 고유명사, 약어, 여러 단어 구는 직접 한 번 더 훑어본다. 사전에 없는 단어는 `ipa`를 넣으라는 메시지가 나온다.
5. **검증표 확인**: 빌드가 각 음성을 음성인식으로 다시 받아적어 보여 준다. ✓ 정상, △ 뜻에 맞춘 발음이라 철자와 다르게 적힘(예: read 과거형 → "Red", 정상), ? 다르게 들릴 수 있음 → 원인 확인 후 고친다.
6. **사이트 파일 만들기**: `python3 ~/wordbook/make_site.py --repo /home/claude/words-practice out/e3a-2026-10-30.html [다른 반 …]` → 날짜 파일 추가, 모든 반 페이지·첫 화면 재생성, 바뀐 파일 목록 출력. (수동 업로드가 필요할 때만 `--zip <scratchpad>/upload.zip`.)
7. **올리기**
   - 기본(연결됨): repo 폴더에서 `git fetch origin main && git rebase origin/main` → 바뀐 파일 commit (메시지 예: "초3A반·초5B반 10월 30일 단어장 추가") → `git push origin HEAD:main`. GitHub Pages는 main에서 바로 배포되므로 브랜치를 따로 만들지 않는다 (선생님이 이 방식으로 올리도록 연결을 허락함).
   - 연결이 끊긴 경우: zip을 SendUserFile로 보내고 업로드 주소 `https://github.com/dnteacher/Words-Practice/upload/main` 안내 (압축 풀기 → 파일 전부 선택 → 끌어다 놓기 → Commit changes). html 파일을 하나씩 보내면 내려받을 때 `index (1).html`처럼 이름이 바뀌는 문제가 있어 zip으로 보낸다.
8. **확인**: shell·WebFetch에서는 github.io 날짜 페이지 접속이 막혀 있다. `git pull`로 파일이 올라갔는지 확인하고, 페이지는 선생님 컴퓨터의 내장 브라우저(dnteacher.github.io 허용됨)에서 모바일 크기로 열어 단어를 눌러 재생되는지 본다.
9. **QR**: 반 고정 주소 QR은 이미 전달함(2026-10-29). 새 반이 생기면 `python3 ~/wordbook/make_qr.py https://dnteacher.github.io/Words-Practice/반코드.html "<반이름> 영어 단어장" <반이름>-QR.png`.

## 반 추가

`classes.json`에 `{"code": "m1a", "name": "중1A반"}`처럼 한 줄 추가 → 프로젝트의 classes.json도 갱신 → `make_site.py --repo ...` 실행(새 반 빈 페이지 + 첫 화면 갱신) → 올리기 → 새 반 QR 전달.

## 확인된 설계 결정

- **음성 (2026-10-28)**: Kokoro v1.0 `af_heart` (미국 영어). 단어 끝에 마침표를 붙이지 않는다 (붙이면 knife가 knives처럼 꼬리가 생김). 단, 끝에 모음이 붙는 단어(club 등)는 마침표 소리로 바꿔 쓴다 (앱의 읽는 방식, app/fixes.json). Python build.py 에는 아직 이 방식이 없다.
- **느린 속도**: 보통 음성을 음높이 그대로 0.85배·0.7배로 늘린다. Kokoro 자체 속도 옵션은 단어 앞에 'a' 같은 소리가 붙어 음성인식 검증 0/16, 늘리는 방식은 초등 단어 74개 + 예시 16개 모두 통과.
- **발음 사전**: misaki 미국식 사전(품사별 발음 포함). spacy 없이 사전만 쓰고 품사는 Claude가 뜻을 보고 지정.
- **페이지**: 음성(mp3 48kbps, 보통 빠르기)을 페이지 안에 넣은 한 파일 (16단어 ≈ 160KB). 오디오 요소 하나를 재사용해 아이폰 무음 모드·연속 재생에서도 소리가 난다. 예전 단어장(느린 음성 포함)도 새 틀로 보통 음성만 재생한다.
- **학생 화면 범위 (선생님 결정)**: 단어 목록 + 뜻 + 누르면 발음(보통 빠르기만, 2026-10-29 빠르기 3단계에서 변경) + 모두 듣기.
- **공유**: Claude artifact는 Share → Anyone with the link 로 로그인 없이 열림(2026-10-28 선생님 확인, 휴대폰 앱에서는 설정 변경 불가). GitHub Pages는 2026-10-29 개설·확인.
- **반 구조 (2026-10-29)**: 반마다 고정 주소, 열면 최신 단어장이 바로 나오고 아래에 지난 단어장. 10개 반 빈 페이지와 반별 QR 전달, 선생님이 업로드, 내장 브라우저에서 첫 화면·반 페이지 열림 확인.
- **GitHub 연결 (2026-10-29)**: Claude GitHub 앱을 Words-Practice 저장소에만 설치, push 권한 확인. 이후 업로드는 Claude가 한다.
- **나중에 추가할 후보**: 3번 듣고 3번 따라 말하기, 시험 연습 모드(불러 주면 철자·뜻 쓰기), 따라 말하기 녹음·음성인식(만 14세 미만 개인정보 동의 필요), 누가 공부했는지 확인.
