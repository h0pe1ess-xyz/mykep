"""Bounded downloads from the college's fixed HTTPS endpoints."""
import time

import cloudscraper


def fetch_college(url: str, max_bytes: int) -> str:
    deadline = time.monotonic() + 25
    with cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "windows", "desktop": True}) as client:
        with client.get(url, timeout=(5, 10), stream=True, allow_redirects=False) as response:
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError('Unexpected upstream response')
            body = bytearray()
            for chunk in response.iter_content(65536):
                if time.monotonic() > deadline:
                    raise TimeoutError('Upstream download deadline exceeded')
                if len(body) + len(chunk) > max_bytes:
                    raise ValueError('Upstream response too large')
                body.extend(chunk)
            return body.decode('utf-8-sig')
