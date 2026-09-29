#!/usr/bin/env python3
"""Merge the per-group dedup outputs into src/bank/questions.json and flag likely cross-group duplicates."""
import json, re, sys, glob, os

src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gi/dedup'
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'bank', 'questions.json')
items = []
for f in sorted(glob.glob(os.path.join(src, 'out_*.json'))):
    items += json.load(open(f))

keep = ('id', 'cat', 'kind', 'q', 'code', 'a', 'level', 'asked', 'n', 'verified')
clean = []
for it in items:
    c = {k: it[k] for k in keep if k in it and it[k] not in (None, '', [])}
    c.setdefault('asked', [])
    c['n'] = max(1, int(c.get('n', 1)))
    if c.get('verified') is not True:
        c.pop('verified', None)
    clean.append(c)

# cross-group duplicates found by reading the merged title list: loser -> winner
MERGE = {
    'architecture-outbox-slow-dependency': 'messaging-order-analytics-async-redesign',
    'system-design-slow-downstream-call': 'messaging-order-analytics-async-redesign',
    'messaging-basket-add-item-and-order': 'concurrency-patterns-basket-double-checkout',
    'networking-url-list-checker': 'concurrency-patterns-url-checker',
    'networking-async-apis': 'architecture-async-api',
    'databases-clickhouse-from-go': 'databases-clickhouse-batch-inserts',
    'databases-orm-vs-raw-sql': 'databases-orm-in-go',
    'devops-behavioral-observability-experience': 'devops-monitoring-and-logging',
    'messaging-why-message-brokers': 'messaging-message-brokers',
    'system-design-fault-tolerance': 'architecture-fault-tolerance-patterns',
}
# not Go interview material (asked in a Python interview)
DROP = {'algorithms-python-list-set-generator', 'tooling-testing-python-context-managers'}

def absorb(w, l):
    w['asked'] = sorted(set(w['asked']) | set(l['asked']))
    w['n'] += l['n']

by = {}
for c in clean:
    if c['id'] in DROP:
        continue
    prev = by.get(c['id'])
    if prev:  # same id from two groups = same question; keep the non-behavioral answer
        w, l = (c, prev) if prev['kind'] == 'behavioral' and c['kind'] != 'behavioral' else (prev, c)
        absorb(w, l)
        by[c['id']] = w
        continue
    by[c['id']] = c
for l, w in MERGE.items():
    absorb(by[w], by.pop(l))
clean = list(by.values())

# list titles must say what the puzzle is about
TITLE = {
    'go-basics-len-cyrillic-string': 'What does this program print? (`len` of Cyrillic strings)',
    'go-basics-value-receiver-increment': 'What does this program print? (incrementing through a value receiver)',
    'go-basics-missing-return-compile-error': 'Does this compile? (a function with a result type and an empty body)',
    'interfaces-nil-pointer-in-empty-interface': 'What do these three `== nil` checks print? (nil *string inside an empty interface)',
    'slices-mutate-element-in-func': 'What does this program print? (a function writes to an element of a passed slice)',
}
for i, t in TITLE.items():
    q = by[i]['q'].split('\n')
    by[i]['q'] = '\n'.join([t] + q[1:])

def words(s):
    return {w for w in re.findall(r'[a-z0-9]+', s.lower()) if len(w) > 2}

stop = words('what how why does the and are for with you this that when which can there difference between explain tell about')
first = [(c, words(c['q'].split('\n')[0]) - stop) for c in clean]
print('possible cross-category duplicates:')
for i, (a, wa) in enumerate(first):
    for b, wb in first[i + 1:]:
        if a['cat'] != b['cat'] and wa and wb and len(wa & wb) / len(wa | wb) >= 0.6:
            print(f"  {a['id']} <> {b['id']}")

clean.sort(key=lambda c: (c['cat'], -c['n'], c['id']))
json.dump(clean, open(out, 'w'), ensure_ascii=False, indent=1)
print(len(clean), 'questions →', os.path.relpath(out))
