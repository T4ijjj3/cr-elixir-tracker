#!/bin/bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

LOG_DIR="${CR_LOG_DIR:-$BASE_DIR/logs}"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="${CR_DIAG_REPORT_FILE:-$LOG_DIR/localhost_diagnostic_${TS}.log}"
touch "$REPORT_FILE"
exec > >(tee -a "$REPORT_FILE") 2>&1

timestamp() {
    date +"%Y-%m-%dT%H:%M:%S%z"
}

log() {
    echo "$(timestamp) | $*"
}

check_port() {
    local host="$1"
    local port="$2"
    if timeout 1 bash -c "echo > /dev/tcp/${host}/${port}" >/dev/null 2>&1; then
        echo "open"
    else
        echo "closed"
    fi
}

http_code() {
    local url="$1"
    if command -v curl >/dev/null 2>&1; then
        curl -sk --max-time 2 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true
    else
        echo "curl-unavailable"
    fi
}

log "===== Diagnóstico localhost ====="
log "cwd=$BASE_DIR"
log "user=$(id -un)"
log "host=$(hostname)"
log "kernel=$(uname -srvmo)"
log "DISPLAY=${DISPLAY:-<vazio>} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-<vazio>}"
log "BROWSER=${BROWSER:-<vazio>} XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-<vazio>}"

log "--- Ferramentas ---"
for cmd in xdg-open curl ss rg python3; do
    if command -v "$cmd" >/dev/null 2>&1; then
        log "$cmd=$(command -v "$cmd")"
    else
        log "$cmd=indisponível"
    fi
done

if command -v xdg-mime >/dev/null 2>&1; then
    log "xdg-mime http handler: $(xdg-mime query default x-scheme-handler/http 2>/dev/null || echo '<não definido>')"
fi

log "--- Portas localhost ---"
for port in 8080 8443 8765; do
    log "127.0.0.1:${port}=$(check_port 127.0.0.1 "$port")"
done

log "--- HTTP Health ---"
log "http://localhost:8080 => $(http_code "http://localhost:8080")"
log "https://localhost:8443/_health => $(http_code "https://localhost:8443/_health")"
log "https://localhost:8443 => $(http_code "https://localhost:8443")"

log "--- Sockets em escuta ---"
if command -v ss >/dev/null 2>&1; then
    ss -ltnp | grep -E ':(8080|8443|8765)\b' || log "Nenhum listener nessas portas."
else
    log "ss indisponível."
fi

log "--- Processos relevantes ---"
ps -ef | grep -E "python.*(listen_server|https_server|http.server)" | grep -v grep || log "Sem processos de servidor detectados."

log "--- Teste xdg-open ---"
if command -v xdg-open >/dev/null 2>&1; then
    XDG_TEST_OUT="$LOG_DIR/xdg_open_test_${TS}.log"
    set +e
    timeout 4 xdg-open "https://localhost:8443" >"$XDG_TEST_OUT" 2>&1
    XDG_RC=$?
    set -e
    log "xdg-open rc=$XDG_RC output_file=$XDG_TEST_OUT"
    if [ -s "$XDG_TEST_OUT" ]; then
        tail -n 20 "$XDG_TEST_OUT"
    else
        log "xdg-open não gerou saída de erro."
    fi
else
    log "xdg-open indisponível."
fi

log "--- Últimos logs ---"
for file in "$LOG_DIR/start_whisper.log" "$LOG_DIR/listen_server.log" "$LOG_DIR/https_server.log" "server.log" "whisper.log"; do
    if [ -f "$file" ]; then
        log "tail $file"
        tail -n 40 "$file"
    else
        log "arquivo ausente: $file"
    fi
done

log "===== Fim do diagnóstico ====="
log "Relatório salvo em: $REPORT_FILE"
