"""Generate release identifiers and frozen PWA shell hashes from VERSION."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def generate(check: bool = False) -> None:
    version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-z0-9.]+)?', version):
        raise ValueError('Invalid VERSION')
    calendar = json.loads((ROOT / 'static/data/calendar.json').read_text(encoding='utf-8'))
    generated = {'static/js/calendar-config.js': 'window.MYKEP_CALENDAR_CONFIG = ' + json.dumps(calendar, ensure_ascii=False, sort_keys=True) + ';\n'}
    for name in ('static/index.html', 'static/about.html', 'static/js/teacher-hints.js', 'static/js/boot.js', 'admin_static/sw.js'):
        path = ROOT / name
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'\?v=[\w.-]+', '?v=' + version, text)
        text = re.sub(r'(<meta content=")[^"]+(" name="mykep-build"/>)', rf'\g<1>{version}\2', text)
        if name.endswith('.html') and 'name="mykep-build"' not in text:
            text = text.replace('<head>', '<head>\n<meta content="' + version + '" name="mykep-build"/>')
        if name.endswith('.html'):
            text = re.sub(r'MyKep v\d+\.\d+\.\d+(?:-[a-z0-9.]+)?', 'MyKep v' + version, text)
        if name.endswith('boot.js'):
            text = re.sub(r"version: '[^']+'", "version: '" + version + "'", text)
        if name == 'admin_static/sw.js':
            text = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'mykep-admin-v" + version + "'", text)
        generated[name] = text
    worker = (ROOT / 'static/sw.js').read_text(encoding='utf-8')
    worker = re.sub(r"const CACHE_NAME = '[^']+'", "const CACHE_NAME = 'mykep-cache-v" + version + "'", worker)
    worker = re.sub(r'^const RELEASE_VERSION = .*;\n', '', worker, flags=re.M)
    worker = worker.replace('const APP_SHELL', "const RELEASE_VERSION = '" + version + "';\nconst APP_SHELL")
    worker = re.sub(r'\?v=[\w.-]+', '?v=' + version, worker)
    if '/js/calendar-config.js?' not in worker:
        worker = worker.replace('const APP_SHELL = [', 'const APP_SHELL = [\n    "/js/calendar-config.js?v=' + version + '",')
    if '/js/dialogs.js?' not in worker:
        worker = worker.replace('const APP_SHELL = [', 'const APP_SHELL = [\n    "/js/dialogs.js?v=' + version + '",')
    shell = json.loads(re.search(r'const APP_SHELL = (\[.*?\]);', worker, re.S)[1])
    hashes = {}
    for url in shell:
        name = 'static/' + ('index.html' if url == '/' else url.split('?')[0].lstrip('/'))
        if name in generated:
            content = generated[name].encode()
        elif Path(name).suffix in ('.js', '.css', '.json'):
            content = (ROOT / name).read_text(encoding='utf-8').encode()
        else:
            content = (ROOT / name).read_bytes()
        hashes[url] = hashlib.sha256(content).hexdigest()
    line = 'const SHELL_HASHES = ' + json.dumps(hashes, ensure_ascii=False, sort_keys=True) + ';'
    worker = re.sub(r'^const SHELL_HASHES = .*;\n', '', worker, flags=re.M)
    worker = worker.replace('const OPTIONAL_ASSETS', line + '\nconst OPTIONAL_ASSETS')
    generated['static/sw.js'] = worker
    drift = []
    for name, content in generated.items():
        path = ROOT / name
        if not path.exists() or path.read_text(encoding='utf-8') != content:
            drift.append(name)
            if not check:
                path.write_bytes(content.encode())
    if check and drift:
        raise SystemExit('Release artifacts out of date: ' + ', '.join(drift))
    print('Release artifacts verified' if check else 'Release artifacts generated')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    generate(parser.parse_args().check)
