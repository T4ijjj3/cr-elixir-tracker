import http.server
import ssl

port = 8443
server_address = ('0.0.0.0', port)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

import ssl
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile='server.pem')

httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Servidor rodando em https://0.0.0.0:{port}/")
print("Para acessar do celular via Tailscale, conecte-se a:")
print(f"https://100.84.212.58:{port}/")
httpd.serve_forever()
