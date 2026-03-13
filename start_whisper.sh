#!/bin/bash
set -e

echo "============================================="
echo "⚙️  Instalando e rodando Servidor Whisper AI"
echo "============================================="

HTTP_PID=""

if ! (echo > /dev/tcp/127.0.0.1/8443) >/dev/null 2>&1; then
    echo "🌐 Iniciando interface web em https://localhost:8443"
    python3 https_server.py >/tmp/cr_elixir_tracker_https.log 2>&1 &
    HTTP_PID=$!
fi

cleanup() {
    if [ -n "$HTTP_PID" ]; then
        kill "$HTTP_PID" >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT

# Remove cache do apt-get se necessário, mas aqui usaremos apt apenas para FFmpeg, que já deve estar ativo ou instalado
if ! command -v ffmpeg &> /dev/null
then
    echo "⚠️ FFmpeg não encontrado. Instalando ffmpeg..."
    sudo apt update && sudo apt install -y ffmpeg
fi

if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual Python..."
    python3 -m venv venv
fi

echo "🔄 Ativando ambiente..."
source venv/bin/activate

echo "⬇️  Instalando Faster Whisper e Websockets..."
pip install --upgrade pip
pip install faster-whisper websockets torch typing-extensions

echo "🚀 Iniciando Inteligência Artificial..."
echo "🖥️  Abra: https://localhost:8443"
python listen_server.py
