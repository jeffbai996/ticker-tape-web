# The responsive matrix gate

`npm run probe` serves the built `dist/` and drives a real Chromium over it at
six viewports. It is wired into `.github/workflows/deploy.yml` between the
build and `configure-pages`, so a regression fails the job and **nothing is
published**.

## Run it

```bash
npm run build              # the gate grades dist/, it does not build for you
npm run probe              # serve + matrix, exit 0/1
npm run probe -- --offline # same run with every off-origin host refused
npm run probe -- --routes '#/,#/markets' --attempts 1 --json-out probe.json
```

By hand against something already served (unchanged from before):

```bash
python3 scripts/probe_matrix.py http://127.0.0.1:8098/ --route '#/markets'
python3 scripts/probe_matrix.py http://127.0.0.1:8098/ --routes '#/,#/screen' --json
```

The gate script (`scripts/probe_gate.py`) starts its own `http.server` on a free
port and mounts `dist/` at the base path it reads out of the built
`index.html` — `/ticker-tape-web/` for the Pages build, `/` for a `--base=/`
build. Hash routes need a real origin; `file://` cannot load the module graph.

## What it asserts

Hard failures, asserted at every viewport, with or without market data:

| check | fails when |
|-------|-----------|
| horizontal scroll | `documentElement.scrollWidth > clientWidth` |
| render floor | the route paints fewer than 150 elements (white screen / dead lazy chunk) |
| toolbar rows | `.dashboard-controls` children no longer share one top edge |
| bottom nav overlap | the phone nav covers the add-symbol control |
| console / page errors | an error raised **by the served build** |

Skipped, with a printed `~ skipped:` note, when the board came up with no
quotes: quote-cell clipping, ext-hours paint, price-column alignment. These
need painted rows to mean anything, and a market-data outage must not turn the
deploy red.

## Why it does not flake

- **Provider noise is not a failure.** A console error whose origin is not the
  local server (data worker, font CDN, quote websocket) is recorded as
  `provider noise` and printed, never counted. An error from the build's own
  bundle — including a 404 on a hashed asset — is a hard failure.
- **One bounded retry.** The whole probe runs at most twice; the second
  attempt is the verdict. Attempt 1's failures are still printed and kept in
  the JSON, so an intermittent failure is visible even when the retry passes.
- **A re-read inside the view.** If a view fails on the first evaluation, the
  probe waits 1.5s and re-measures once — measured columns and lazy widgets
  settle asynchronously, and a width read mid-update is not a regression.
- **Hard per-view timeout** (`--timeout`, default 90s) plus
  `timeout-minutes: 12` on the step, so a wedged page cannot hang the job.

## Reading the output

```
ok   #/            desktop-1376             37     13       0      1  [217]
FAIL #/            iphone-390               37     10       0      5  [64, 72, 77]
       ! toolbar wrapped to 5 rows
```

`rows` = board rows found, `quotes` = rows whose price box shows digits (0 is
fine — see skips), `hscroll` = overflow px, `tbRows` = toolbar row count,
`priceX` = distinct price-box left offsets. More than one `priceX` value at
≥545px wide means the measured columns did not land — that is the check that
catches a ragged price column. On phones the multi-value list is expected and
not graded.

Exit codes: `0` clean, `1` a check regressed (block the deploy), `2` the probe
itself could not run twice (browser launch, navigation timeout, missing build).

CI uploads `probe-matrix.json` as the `probe-matrix` artifact on every run,
pass or fail; it holds both attempts, per-view numbers, skips, and the noise
list.

## Verifying the gate itself

```bash
cp -r dist /tmp/broken
# force the toolbar to wrap and throw once, then grade the broken copy
python3 - <<'EOF'
import pathlib
p = pathlib.Path('/tmp/broken/index.html')
p.write_text(p.read_text().replace('</head>',
  '<style>.dashboard-controls{flex-wrap:wrap!important}'
  '.dashboard-controls>*{min-width:70%!important}</style>'
  '<script>setTimeout(function(){throw new Error("injected")},800)</script></head>', 1))
EOF
python3 scripts/probe_gate.py --dist /tmp/broken --routes '#/'   # exits 1
```

Note that injecting a wide element into `<body>` does **not** trip the
overflow check: the shell clips horizontally, so `scrollWidth` never grows.
Overflow regressions show up from inside the layout, which is why the toolbar
and column checks carry most of the weight.

## The idle probe is not gated

`scripts/probe_idle.py` stays a manual, comparative instrument. Its numbers —
long tasks, layout/recalc counts, script ms, net/min — depend on machine load
and on how much live data arrives during the window, and a shared CI runner
supplies neither a stable CPU nor a stable feed. There is no threshold that is
both meaningful and stable enough to block a deploy on, so it is run by hand
before/after a change on the same box, as its docstring describes.
