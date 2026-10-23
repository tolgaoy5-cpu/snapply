"""Collects real, currently open UK job application pages from the public job-board APIs of common
applicant tracking systems (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio),
for the live check: python3 ats_urls.py [per_ats] > urls.txt
Company names are guesses at UK employers on each platform; ones that do not answer are skipped.
SmartRecruiters is left out: its apply pages sit behind a bot check, so it is tested by hand."""
import json
import random
import sys
import urllib.request

PER_ATS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
UK = ('london', 'united kingdom', 'uk', 'england', 'manchester', 'edinburgh', 'bristol', 'leeds', 'birmingham',
      'glasgow', 'cambridge', 'oxford', 'cardiff', 'belfast', 'remote - uk', 'gb')

COMPANIES = {
    'greenhouse': ['monzo', 'gocardless', 'deliveroo', 'cleoai', 'thoughtmachine', 'checkoutcom', 'oaknorth', 'bloomandwild',
                   'wise', 'paddle', 'onfido', 'truelayer', 'tide', 'zopa', 'motorway', 'farewill', 'cazoo', 'improbable',
                   'darktrace', 'graphcore', 'beamery', 'citymapper', 'peakon', 'pleo', 'octopusenergy', 'bulb', 'starlingbank'],
    'lever': ['cuvva', 'multiverse', 'labster', 'brainlabs', 'hopin', 'palantir', 'ocadotechnology', 'yulife', 'curve',
              'unmind', 'quantexa', 'cera', 'papier', 'snyk', 'depop', 'healx', 'secondmind', 'luminance'],
    'ashby': ['synthesia', 'elevenlabs', 'cleo', 'lindus-health', 'tractable', 'ravelin', 'stenn', 'cledara', 'hiro',
              'juro', 'paddle', 'causaly', 'wayve', 'gravitee', 'nory', 'flock'],
    'workable': ['starling-bank', 'pockit', 'lendable', 'zego', 'birdie', 'feedr', 'spektrix', 'carwow', 'thriva',
                 'housekeep', 'perkbox', 'patchwork-health', 'onecare', 'gousto', 'huel', 'bud'],
    'recruitee': ['pockit', 'tembo', 'nested', 'yoti', 'pushdoctor', 'cognism', 'sennder', 'fintern'],
    'personio': ['moneybox', 'paymentsense', 'bloom', 'thriva', 'cleo', 'kaluza', 'packfleet'],
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Snapply live check)', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def uk(loc):
    loc = (loc or '').lower()
    return any(w in loc for w in UK)


def greenhouse(c):
    for j in get(f'https://boards-api.greenhouse.io/v1/boards/{c}/jobs').get('jobs', []):
        if uk((j.get('location') or {}).get('name')):
            yield f"https://job-boards.greenhouse.io/{c}/jobs/{j['id']}"


def lever(c):
    for j in get(f'https://api.lever.co/v0/postings/{c}?mode=json'):
        if uk((j.get('categories') or {}).get('location')):
            yield j['hostedUrl'].rstrip('/') + '/apply'


def ashby(c):
    for j in get(f'https://api.ashbyhq.com/posting-api/job-board/{c}').get('jobs', []):
        if uk(j.get('location')) or any(uk(s.get('location')) for s in j.get('secondaryLocations') or []):
            yield j['jobUrl'].rstrip('/') + '/application'


def workable(c):
    for j in get(f'https://apply.workable.com/api/v1/widget/accounts/{c}').get('jobs', []):
        if uk(f"{j.get('city')} {j.get('country')}"):
            yield f"https://apply.workable.com/{c}/j/{j['shortcode']}/apply/"


def recruitee(c):
    for j in get(f'https://{c}.recruitee.com/api/offers/').get('offers', []):
        if uk(f"{j.get('location')} {j.get('country')}"):
            yield j['careers_apply_url']


def personio(c):
    # Personio's public feed is XML; fetch it as text.
    req = urllib.request.Request(f'https://{c}.jobs.personio.de/xml', headers={'User-Agent': 'Mozilla/5.0'})
    import re
    xml = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', 'replace')
    for pos in re.findall(r'<position>(.*?)</position>', xml, re.S):
        office = re.search(r'<office>(.*?)</office>', pos, re.S)
        jid = re.search(r'<id>(\d+)</id>', pos)
        if jid and uk(office.group(1) if office else ''):
            yield f'https://{c}.jobs.personio.de/job/{jid.group(1)}?display=en#apply'


def main():
    random.seed()
    out = []
    for ats, companies in COMPANIES.items():
        found = []
        for c in companies:
            try:
                found += [(ats, c, u) for u in list(globals()[ats](c))[:3]]   # at most 3 per company
            except Exception:
                continue
        random.shuffle(found)
        picked = found[:PER_ATS]
        print(f'{ats}: {len(found)} UK postings found, using {len(picked)} '
              f'({", ".join(sorted({c for _, c, _ in picked}))})', file=sys.stderr)
        out += [u for _, _, u in picked]
    print('\n'.join(out))


if __name__ == '__main__':
    main()
