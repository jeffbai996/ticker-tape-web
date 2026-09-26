"""Offline response-footer regression: history, refresh and narrow layouts."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from probe_gate import serve

parser = argparse.ArgumentParser()
parser.add_argument('--dist', required=True)
args = parser.parse_args()
server, base = serve(Path(args.dist), '/')
history = [dict(role='user', content='Summarize the test.'), dict(
    role='assistant', content='The response is complete. The footer keeps its recorded metrics after a refresh.',
    model='test-model', modelLabel='Qwen 3.8 Flash Next', effort='high',
    traceStartedAt=1000, traceEndedAt=189000, traceUsage={'in': 1200, 'out': 4977},
    trace=[dict(key='model-0', kind='model', label='Answered', status='done', startedAt=1000, endedAt=189000)])]
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in (1280, 390):
            page = browser.new_page(viewport={'width': width, 'height': 900})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            page.add_init_script('localStorage.setItem("chat_history_v1", '+json.dumps(json.dumps(history))+');')
            page.goto(base+'#/chat', wait_until='domcontentloaded')
            footer = page.locator('.chat-token-footer')
            footer.wait_for()
            for _ in range(2):
                assert '4,977' in footer.inner_text()
                assert '3m 8s' in footer.inner_text()
                assert '26.5 t/s' in footer.inner_text()
                assert footer.locator('.chat-token-model').get_attribute('title').endswith('high')
                assert footer.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                page.reload(wait_until='domcontentloaded')
                footer.wait_for()
            page.wait_for_timeout(700)
            page.screenshot(path=f'/tmp/ttw-footer-{width}.png')
            assert not errors, errors
            page.close()
        browser.close()
        print('PASS: desktop/mobile footer, exact reported counts, saved timing, refresh, no overflow')
finally:
    server.shutdown()
