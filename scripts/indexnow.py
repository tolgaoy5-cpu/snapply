"""Tells Bing (and through it ChatGPT search, Yandex and others) that the site's pages changed: python3 scripts/indexnow.py
Uses the IndexNow protocol; the key file site/<key>.txt must be live on snapply.co.uk first."""
import json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
key = (ROOT / 'scripts/indexnow_key.txt').read_text().strip()
urls = re.findall(r'<loc>(.*?)</loc>', (ROOT / 'site/sitemap.xml').read_text())
body = json.dumps({'host': 'snapply.co.uk', 'key': key, 'keyLocation': f'https://snapply.co.uk/{key}.txt', 'urlList': urls}).encode()
req = urllib.request.Request('https://api.indexnow.org/indexnow', body, {'Content-Type': 'application/json; charset=utf-8'})
with urllib.request.urlopen(req, timeout=30) as r:
    print(r.status, len(urls), 'URLs submitted')
