"""Real HTTP test. Run only against your own local/staging server, never a third-party site."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import statistics
import time
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--group', required=True)
    parser.add_argument('--users', type=int, default=200)
    parser.add_argument('--requests-per-user', type=int, default=10)
    parser.add_argument('--confirm-owned-server', action='store_true', required=True)
    args = parser.parse_args()
    if not 1 <= args.users <= 500 or not 1 <= args.requests_per_user <= 100:
        parser.error('Use 1..500 users and 1..100 requests per user')

    def visitor(user):
        rows = []
        query = urlencode({'group':args.group, 'duration1':80, 'duration2':60, 'uid':f'loadtest_{user}'})
        for _ in range(args.requests_per_user):
            start = time.perf_counter()
            try:
                with urlopen(args.url.rstrip('/')+'/api/schedule?'+query, timeout=15) as response:
                    payload = json.load(response)
                    success = response.status == 200 and payload.get('status') == 'success'
            except (OSError, ValueError, HTTPError):
                success = False
            rows.append((time.perf_counter()-start,success))
        return rows

    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.users) as pool:
        rows = [item for batch in pool.map(visitor, range(args.users)) for item in batch]
    elapsed = time.perf_counter()-start
    latencies = sorted(row[0]*1000 for row in rows)
    errors = sum(not row[1] for row in rows)
    print(json.dumps({'concurrent_users':args.users, 'requests':len(rows), 'errors':errors,
        'elapsed_s':round(elapsed,3), 'requests_per_s':round(len(rows)/elapsed,2),
        'p50_ms':round(statistics.median(latencies),2),
        'p95_ms':round(latencies[min(len(latencies)-1, int(len(latencies)*.95))],2),
        'max_ms':round(max(latencies),2)}, indent=2))
    raise SystemExit(1 if errors else 0)


if __name__ == '__main__':
    main()
