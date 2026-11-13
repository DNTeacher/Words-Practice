# tools — 들어Voca 만들기 도구

이 폴더가 원본이에요 (2026-11-13 Claude 프로젝트 `wordbook/` 에서 옮김). 설계 기록은 `DESIGN.md`.

| 파일 | 하는 일 |
|---|---|
| `template.html` | **학생 단어장 페이지 틀 원본**. 고친 뒤 저장소 폴더에서 `python3 tools/export_app_templates.py .` → `app/student.html`, `app/list-page.html` 이 만들어짐 (선생님 앱이 이 틀로 페이지를 만든다) |
| `export_app_templates.py` | 위 내보내기 (`make_site.py` 의 머리말·첫 화면 틀을 함께 씀) |
| `make_site.py` | 같은 틀로 반 페이지·첫 화면을 만드는 Python 판 (예전 채팅 방식, 비교·복구용) |
| `wordvoice.py` | Python 발음 엔진: misaki 사전 + Kokoro(af_heart) 음성, `clear_s_onset`(spice 같은 s+p/t/k 첫소리). 선생님 앱의 `app/g2p.js`·`app/audio.js` 와 같은 계산 |
| `build.py` | 단어장 JSON → 학생 페이지 (Python 방식, 음성인식 검증 포함) |
| `wordrange.py` | 시험 범위 글자 해석 ("4회 11~20번", "unit.5", "Day 6 1~5번") — `app/books.js` `resolveRange` 와 같은 규칙 |
| `hwp2grid.py`, `hwpx2grid.py` | 한글(HWP/HWPX) 단어장 → 표 |
| `bricks_reading_pdf.py` | Bricks Reading Word List PDF → 단어장 JSON (`Words-Books/books/<id>.json`) |
| `make_qr.py` | 반 주소 QR 그림 |
| `setup.sh` | Python 도구용 환경 준비 (misaki, Kokoro 모델, sherpa-onnx 음성인식을 내려받음 — 모델 파일은 저장소에 없음) |
| `example-set.json` | 단어장 JSON 예시 |

교재 단어장 정리본(`books/*.json`)은 출판사 교재 내용이라 공개 저장소에 두지 않고 비공개 `Words-Books` 저장소에 있어요.
