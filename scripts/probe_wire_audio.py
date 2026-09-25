"""Check the embedded native session reader without generating reports or captures."""
import argparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('url')
parser.add_argument('--session', type=int, required=True)
args = parser.parse_args()
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(1280, 900), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(args.url, wait_until='domcontentloaded')
        page.get_by_role('button', name='live audio', exact=True).click(timeout=20000)
        page.locator(f'[data-audio-session="{args.session}"]').click(timeout=20000)
        frame = page.frame_locator('[data-audio-player]')
        frame.locator('#session-title').filter(has_not_text='Captured event').wait_for(timeout=20000)
        player = frame.locator('#player')
        page.wait_for_timeout(3000)
        state = player.evaluate('(a) => ({src: !!a.currentSrc, duration:a.duration, error:a.error?.code})')
        assert state['src'] and state['duration'] > 0 and not state['error'], state
        # Muted playback and a real seek exercise the media transport.
        player.evaluate('async a => { a.muted=true; a.currentTime=30; await a.play() }')
        page.wait_for_timeout(1500)
        assert player.evaluate('a => a.currentTime') > 30
        player.evaluate('a => a.pause()')
        assert not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
        page.screenshot(path=f'/tmp/ttw-audio-{width}.png')
        print({'width': width, 'audio': 'play/seek passed', 'duration': state['duration'], 'page_errors': errors})
        page.close()
    browser.close()
