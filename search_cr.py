import urllib.request
import json
req = urllib.request.Request("https://api.duckduckgo.com/?q=clash+royale+elixir+regeneration+rate+seconds&format=json", headers={"User-Agent": "Mozilla/5.0"})
content = urllib.request.urlopen(req).read().decode('utf-8')
print(content[:1000])
