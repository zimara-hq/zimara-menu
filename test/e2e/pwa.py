"""Real Chromium service-worker test using local assets; no provider or database calls.
Run: python test/e2e/pwa.py (requires the workspace's existing Python Playwright).
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

PUBLIC = Path(__file__).resolve().parents[2] / 'public'


class Assets(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.split('?')[0] == '/offline':
            self.path = '/offline.html'
        elif self.path.startswith(('/pwa-fixture', '/t/browser-test-token')):
            body = b'''<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"></head><body><main>Live fixture</main><footer>Fixture</footer><script type="module" src="/mobile.js"></script></body></html>'''
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Assets)
    Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
            try:
                context = browser.new_context(viewport={'width': 390, 'height': 844})
                page = context.new_page()
                page.add_init_script('''localStorage.setItem('zm_lang', 'en'); window.permissionCalls = 0; Notification.requestPermission = async () => { window.permissionCalls++; return 'default'; };''')
                page.goto(origin + '/pwa-fixture', wait_until='networkidle')
                page.wait_for_selector('#mobile-readiness')
                page.locator('#mobile-readiness summary').click()
                assert 'Network connected' in page.locator('#mobile-readiness').inner_text()
                assert page.evaluate('window.permissionCalls') == 0
                page.evaluate('navigator.serviceWorker.ready')
                page.wait_for_function('navigator.serviceWorker.controller !== null')
                # A browser install event exposes a one-use, user-gesture button.
                page.evaluate('''() => {
                  window.installCalls = 0;
                  const event = new Event('beforeinstallprompt', {cancelable: true});
                  event.prompt = async () => { window.installCalls++; };
                  event.userChoice = Promise.resolve({outcome: 'dismissed'});
                  dispatchEvent(event);
                }''')
                page.get_by_role('button', name='Install on this device').click()
                assert page.evaluate('window.installCalls') == 1
                assert not page.get_by_role('button', name='Install on this device').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                context.set_offline(True)
                page.wait_for_function('document.querySelector("#mobile-readiness").textContent.includes("You are offline")')
                page.goto(origin + '/t/browser-test-token', wait_until='load')
                page.wait_for_selector('#retry')
                assert page.url.endswith('/t/browser-test-token')
                assert 'Connection unavailable' in page.inner_text('main')
                assert 'No network connection' in page.inner_text('#connection')
                cached = page.evaluate('''async () => {
                  const cache = await caches.open('zm-offline-v1');
                  return (await cache.keys()).map(r => new URL(r.url).pathname).sort();
                }''')
                assert cached == ['/offline', '/offline.js'], cached
                context.set_offline(False)
                page.wait_for_function('document.querySelector("#connection").textContent.includes("Network connected")')
                page.get_by_role('button', name='إعادة المحاولة · Retry').click()
                page.wait_for_selector('#mobile-readiness')
                assert 'Live fixture' in page.inner_text('main')
                context.close()
                # iPadOS can use a desktop UA, but still needs Home Screen installation for push.
                ipad = browser.new_context(user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15')
                ipad.add_init_script("localStorage.setItem('zm_lang', 'en'); Object.defineProperty(navigator, 'platform', {value: 'MacIntel'}); Object.defineProperty(navigator, 'maxTouchPoints', {value: 5});")
                page = ipad.new_page()
                page.goto(origin + '/pwa-fixture', wait_until='networkidle')
                page.locator('#mobile-readiness summary').click()
                assert 'Share → Add to Home Screen' in page.locator('#mobile-readiness').inner_text()
                assert 'require a supported OS' in page.locator('#mobile-readiness').inner_text()
                ipad.close()
                print('PASS: Chromium install gesture, no automatic permission request, iPad guidance, mobile width, offline fallback/cache isolation and retry recovery')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
