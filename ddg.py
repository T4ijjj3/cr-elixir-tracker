url = "https://html.duckduckgo.com/html/?q=clash+royale+elixir+generation+rate+overtime"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    print(text[:2000])
except Exception as e:
    print(e)
