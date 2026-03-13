import urllib.request
import re

url = "https://html.duckduckgo.com/html/?q=clash+royale+elixir+generation+rates+2023+2024"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
text = re.sub(r'<[^>]+>', ' ', html)
text = re.sub(r'\s+', ' ', text)
print(text[:2000])
