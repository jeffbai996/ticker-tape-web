import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

it('offline probe blocks service workers and admits only the exact served origin', () => {
  const result = spawnSync('python3', ['-c', `
import sys
from types import SimpleNamespace
from unittest.mock import Mock
sys.path.insert(0, 'scripts')
import probe_matrix
page = Mock()
page.goto.side_effect = RuntimeError('stop before navigation')
browser = Mock()
browser.new_page.return_value = page
probe_matrix.probe_view(browser, 'http://127.0.0.1:8123/', '#/', ('fixture', 800, 600), 1, 0, True)
assert browser.new_page.call_args.kwargs['service_workers'] == 'block'
route = page.route.call_args.args[1]
for url, admitted in [('http://127.0.0.1:8123/assets/app.js', True),
                       ('http://127.0.0.1:81234/assets/app.js', False),
                       ('https://example.com/sync', False)]:
    request = Mock()
    request.request = SimpleNamespace(url=url)
    route(request)
    assert request.continue_.called == admitted
    assert request.abort.called != admitted
`], { encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
})
