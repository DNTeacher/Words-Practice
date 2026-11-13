#!/usr/bin/env bash
# 단어장 발음 시스템 작업 환경 준비 (새 세션에서 한 번 실행, 약 2~3분)
# - 발음 사전: misaki (미국식, 품사별 발음 포함)
# - AI 음성: Kokoro v1.0 (af_heart 음성)
# - 검증용 음성인식: sherpa-onnx + Parakeet TDT 0.6B v2
# PyPI/npm/Hugging Face 가 막혀 있어도 GitHub 만으로 준비되도록 구성함.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
mkdir -p ~/tts ~/asr ~/wordbook/sets ~/wordbook/out

cd ~/tts
[ -d misaki ] || git clone --depth 1 -q https://github.com/hexgrad/misaki
[ -d kokoro-onnx ] || git clone --depth 1 -q https://github.com/thewh1teagle/kokoro-onnx
[ -d python-qrcode ] || git clone --depth 1 -q https://github.com/lincolnloop/python-qrcode
[ -f kokoro-v1.0.onnx ] || curl -sSL -o kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
[ -f voices-v1.0.bin ] || curl -sSL -o voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

cd ~/asr
[ -d sherpa-onnx-v1.12.15-linux-x64-static ] || curl -sSL https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.15/sherpa-onnx-v1.12.15-linux-x64-static.tar.bz2 | tar xj
[ -d sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8 ] || curl -sSL https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2 | tar xj

# 스크립트 배치 (이 폴더에 함께 있는 파일들)
cp "$SRC/wordvoice.py" ~/tts/
cp "$SRC/build.py" "$SRC/make_qr.py" "$SRC/make_site.py" "$SRC/export_app_templates.py" "$SRC/template.html" "$SRC/../classes.json" ~/wordbook/

python3 -c "import numpy, onnxruntime, scipy, PIL; print('python 라이브러리 OK')"
ffmpeg -hide_banner -filters 2>/dev/null | grep -q rubberband && echo "ffmpeg rubberband OK" || echo "주의: ffmpeg rubberband 없음 (느린 음성 대체 방식 일부 사용 불가)"
echo "준비 완료"
