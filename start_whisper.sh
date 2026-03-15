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

export CR_WHISPER_MAX_NEW_TOKENS="${CR_WHISPER_MAX_NEW_TOKENS:-18}"
export CR_WHISPER_HOTWORD_LIMIT="${CR_WHISPER_HOTWORD_LIMIT:-96}"
export CR_LOW_LATENCY_MODE="${CR_LOW_LATENCY_MODE:-1}"
export CR_WHISPER_ALT_ENABLED="${CR_WHISPER_ALT_ENABLED:-0}"
export CR_WHISPER_TARGET_RAM_GB="${CR_WHISPER_TARGET_RAM_GB:-16}"
export CR_WHISPER_COMPUTE_TYPE="${CR_WHISPER_COMPUTE_TYPE:-int8}"

CPU_THREADS_DEFAULT="$(nproc 2>/dev/null || echo 4)"
if [ -z "${CR_WHISPER_CPU_THREADS:-}" ]; then
    export CR_WHISPER_CPU_THREADS="$CPU_THREADS_DEFAULT"
fi

if [ -z "${CR_WHISPER_PTBR_MODEL:-}" ]; then
    for candidate in \
        "models/distil-whisper-large-v3-ptbr-ct2" \
        "models/whisper-large-v3-ptbr-ct2" \
        "models/whisper-ptbr-ct2"
    do
        if [ -d "$candidate" ]; then
            export CR_WHISPER_PTBR_MODEL="$candidate"
            echo "🇧🇷 Modelo PT-BR local detectado: $candidate"
            break
        fi
    done
fi

if [ -z "${CR_WHISPER_MODEL:-}" ]; then
    if [ -n "${CR_WHISPER_PTBR_MODEL:-}" ]; then
        export CR_WHISPER_MODEL="$CR_WHISPER_PTBR_MODEL"
    else
        export CR_WHISPER_MODEL="small"
    fi
fi

echo "🎯 Perfil de voz: latencia-alvo <=500ms (navegador prioritario) + Whisper forte para correcao final"
echo "🧠 Modelo principal Whisper: ${CR_WHISPER_MODEL}"
echo "🧵 Threads CPU Whisper: ${CR_WHISPER_CPU_THREADS}"

echo "⬇️  Instalando Faster Whisper e Websockets..."
pip install --upgrade pip
pip install faster-whisper websockets torch typing-extensions

echo "🚀 Iniciando Inteligência Artificial..."
echo "🖥️  Abra: https://localhost:8443"
python listen_server.py
