#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

LOG_DIR="${CR_LOG_DIR:-$BASE_DIR/logs}"
mkdir -p "$LOG_DIR"
START_LOG_FILE="${CR_START_LOG_FILE:-$LOG_DIR/start_whisper.log}"
HTTPS_STDOUT_LOG="${CR_HTTPS_STDOUT_LOG:-$LOG_DIR/https_server_stdout.log}"

touch "$START_LOG_FILE"
exec > >(tee -a "$START_LOG_FILE") 2>&1

timestamp() {
    date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
    echo "$(timestamp) | $*"
}

is_port_open() {
    local host="$1"
    local port="$2"
    timeout 1 bash -c "echo > /dev/tcp/${host}/${port}" >/dev/null 2>&1
}

http_health() {
    local url="$1"
    if command -v curl >/dev/null 2>&1; then
        curl -sk --max-time 2 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true
    else
        echo "curl-unavailable"
    fi
}

diagnose_ports() {
    log "Diagnóstico de portas (8080/8443/8765):"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn | grep -E ':(8080|8443|8765)\b' || true
    else
        log "ss não disponível no sistema."
    fi
}

print_open_hint() {
    if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
        log "Sem sessão gráfica detectada (DISPLAY/WAYLAND ausentes)."
        log "Se você está no terminal remoto/headless, xdg-open não abrirá navegador local."
    else
        log "Sessão gráfica detectada. DISPLAY=${DISPLAY:-n/a} WAYLAND=${WAYLAND_DISPLAY:-n/a}"
    fi
}

log "============================================="
log "⚙️  Instalando e rodando Servidor Whisper AI"
log "============================================="
log "Diretório base: $BASE_DIR"
log "Arquivo de log desta execução: $START_LOG_FILE"
print_open_hint

HTTP_PID=""

cleanup() {
    if [ -n "$HTTP_PID" ]; then
        log "Encerrando HTTPS server iniciado por este processo (PID=$HTTP_PID)"
        kill "$HTTP_PID" >/dev/null 2>&1 || true
    fi
}

trap cleanup EXIT

if is_port_open "127.0.0.1" "8443"; then
    log "HTTPS já ativo em https://localhost:8443"
else
    log "🌐 Iniciando interface web em https://localhost:8443"
    python3 https_server.py >"$HTTPS_STDOUT_LOG" 2>&1 &
    HTTP_PID=$!
    log "HTTPS iniciado em background. PID=$HTTP_PID log=$HTTPS_STDOUT_LOG"
    sleep 0.6
    if ! kill -0 "$HTTP_PID" >/dev/null 2>&1; then
        log "❌ HTTPS encerrou imediatamente após iniciar."
        if [ -f "$HTTPS_STDOUT_LOG" ]; then
            log "Últimas linhas do log HTTPS:"
            tail -n 40 "$HTTPS_STDOUT_LOG" || true
        fi
        HTTP_PID=""
    elif is_port_open "127.0.0.1" "8443"; then
        local_health="$(http_health "https://localhost:8443/_health")"
        log "HTTPS pronto. Health endpoint respondeu: $local_health"
    else
        log "⚠️ Porta 8443 ainda não está aberta após start."
    fi
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    log "⚠️ FFmpeg não encontrado. Tentando instalar..."
    sudo apt update && sudo apt install -y ffmpeg
fi

if [ ! -d "venv" ]; then
    log "📦 Criando ambiente virtual Python..."
    python3 -m venv venv
fi

log "🔄 Ativando ambiente virtual..."
source venv/bin/activate

export CR_WHISPER_MAX_NEW_TOKENS="${CR_WHISPER_MAX_NEW_TOKENS:-18}"
export CR_WHISPER_HOTWORD_LIMIT="${CR_WHISPER_HOTWORD_LIMIT:-96}"
export CR_LOW_LATENCY_MODE="${CR_LOW_LATENCY_MODE:-1}"
export CR_WHISPER_ALT_ENABLED="${CR_WHISPER_ALT_ENABLED:-0}"
export CR_WHISPER_TARGET_RAM_GB="${CR_WHISPER_TARGET_RAM_GB:-16}"
export CR_WHISPER_COMPUTE_TYPE="${CR_WHISPER_COMPUTE_TYPE:-int8}"
export CR_LISTEN_LOG_FILE="${CR_LISTEN_LOG_FILE:-$LOG_DIR/listen_server.log}"
export CR_HTTPS_LOG_FILE="${CR_HTTPS_LOG_FILE:-$LOG_DIR/https_server.log}"

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
            log "🇧🇷 Modelo PT-BR local detectado: $candidate"
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

log "🎯 Perfil de voz: latência alvo <=500ms + diagnóstico reforçado"
log "🧠 Modelo principal Whisper: ${CR_WHISPER_MODEL}"
log "🧵 Threads CPU Whisper: ${CR_WHISPER_CPU_THREADS}"
log "📄 listen_server.log: ${CR_LISTEN_LOG_FILE}"
log "📄 https_server.log: ${CR_HTTPS_LOG_FILE}"

log "⬇️  Instalando/atualizando dependências Python..."
pip install --upgrade pip
pip install faster-whisper websockets torch typing-extensions

diagnose_ports
log "🚀 Iniciando servidor de voz (WebSocket em localhost:8765)..."
log "🖥️  Abra: https://localhost:8443"
log "🔎 Para diagnóstico completo: ./diagnose_localhost.sh"
python listen_server.py
