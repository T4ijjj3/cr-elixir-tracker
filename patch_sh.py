import re

with open('start_whisper.sh', 'r') as f:
    text = f.read()

text = text.replace('python3 -m http.server 8080 >/tmp/cr_elixir_tracker_http.log 2>&1 &', 'python3 https_server.py >/tmp/cr_elixir_tracker_https.log 2>&1 &')
text = text.replace('if ! (echo > /dev/tcp/127.0.0.1/8080) >/dev/null 2>&1; then', 'if ! (echo > /dev/tcp/127.0.0.1/8443) >/dev/null 2>&1; then')
text = text.replace('http://localhost:8080', 'https://localhost:8443')

with open('start_whisper.sh', 'w') as f:
    f.write(text)
print("ok")
