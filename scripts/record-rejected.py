import json, os, sys
bad = set(sys.argv[1].split())
proposed = json.load(open('scripts/annotate-proposed.json')) if os.path.exists('scripts/annotate-proposed.json') else []
rejected = set(json.load(open('scripts/annotate-rejected.json'))) if os.path.exists('scripts/annotate-rejected.json') else set()
rejected |= {site for site in proposed if site.rsplit(':', 1)[0] in bad}
json.dump(sorted(rejected), open('scripts/annotate-rejected.json', 'w'))
print('rejected sites now:', len(rejected))
