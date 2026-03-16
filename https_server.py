import http.server
import json
import logging
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
HTTPS_LOG_FILE = Path(os.getenv("CR_HTTPS_LOG_FILE", str(LOG_DIR / "https_server.log")))
HTTPS_LOG_LEVEL = os.getenv("CR_HTTPS_LOG_LEVEL", "INFO").strip().upper()
HOST = os.getenv("CR_HTTPS_HOST", "0.0.0.0")
PORT = int(os.getenv("CR_HTTPS_PORT", "8443"))
CERT_FILE = os.getenv("CR_HTTPS_CERT", "server.pem")


def configure_logger():
    logger = logging.getLogger("https_server")
    if logger.handlers:
        return logger
    logger.setLevel(getattr(logging, HTTPS_LOG_LEVEL, logging.INFO))
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    file_handler = logging.FileHandler(HTTPS_LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.propagate = False
    return logger


LOGGER = configure_logger()


def log_event(event, **fields):
    payload = {"event": event, **fields}
    LOGGER.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))


class DiagnosticHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "CRHTTPS/1.0"

    def log_message(self, fmt, *args):
        message = fmt % args
        log_event(
            "http_access",
            client=self.client_address[0] if self.client_address else "-",
            method=getattr(self, "command", "-"),
            path=getattr(self, "path", "-"),
            message=message,
        )

    def log_error(self, fmt, *args):
        message = fmt % args
        LOGGER.error(
            json.dumps(
                {
                    "event": "http_error",
                    "client": self.client_address[0] if self.client_address else "-",
                    "method": getattr(self, "command", "-"),
                    "path": getattr(self, "path", "-"),
                    "message": message,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )

    def do_GET(self):
        if self.path == "/_health":
            payload = {
                "ok": True,
                "service": "https_server",
                "time": datetime.now(timezone.utc).isoformat(),
            }
            encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            log_event("http_health_check", client=self.client_address[0] if self.client_address else "-")
            return
        super().do_GET()


def main():
    cert_path = BASE_DIR / CERT_FILE
    if not cert_path.exists():
        LOGGER.error("Certificado não encontrado: %s", cert_path)
        raise FileNotFoundError(f"Certificado não encontrado: {cert_path}")

    server_address = (HOST, PORT)
    httpd = http.server.HTTPServer(server_address, DiagnosticHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_path))
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    log_event(
        "https_server_started",
        host=HOST,
        port=PORT,
        cert=str(cert_path),
        cwd=os.getcwd(),
        log_file=str(HTTPS_LOG_FILE),
    )
    LOGGER.info("Servidor HTTPS rodando em https://%s:%s/", HOST, PORT)
    LOGGER.info("Health endpoint: https://localhost:%s/_health", PORT)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
