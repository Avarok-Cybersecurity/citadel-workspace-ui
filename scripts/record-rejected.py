"""Record the sites in rejected files, and report which of them we touched.

Errors CASCADE: one bad annotation in a shared module breaks every consumer, and
a run that reverted every file named in the errors reverted 114 files after
touching 37 -- throwing away good work in files it had never edited, and leaving
the broken one in place. Only files this run actually touched can be reverted,
and only they belong in the ledger.
"""
import json, os, sys

bad = set(sys.argv[1].split())
proposed = json.load(open('scripts/annotate-proposed.json')) if os.path.exists('scripts/annotate-proposed.json') else []
touched = {site.rsplit(':', 1)[0] for site in proposed}
ours = sorted(bad & touched)

rejected = set(json.load(open('scripts/annotate-rejected.json'))) if os.path.exists('scripts/annotate-rejected.json') else set()
rejected |= {site for site in proposed if site.rsplit(':', 1)[0] in ours}
json.dump(sorted(rejected), open('scripts/annotate-rejected.json', 'w'))

print('\n'.join(ours))
