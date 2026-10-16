# Ticker Tape for Samsung TV

The web app itself, built for a Tizen TV and driven by the remote. Same
source, same components, same stylesheet as the browser builds; the TV
build changes how they are compiled and adds a remote layer on top.

## Remote

| Key | Action |
| --- | --- |
| ◀ ▲ ▼ ▶ | Move focus to the nearest control in that direction |
| OK | Open or press the focused control |
| Back | Leave a text field, close the open menu or panel, go back a page; on the dashboard, exit |
| Red | Search |
| Blue | Dashboard |
| CH ▲ / CH ▼ | Scroll the focused panel by a page |
| ◀ ▶ on a drop-down | Step through its options |

## What the TV build leaves out

Surfaces that need a pointer or are mostly typing: AI chat, the command
console and its key capture, the AI briefing and report cards, chart
drawing tools, drag and resize handles, and CSV trade import. Links that
would open a new tab open in the TV's web browser.

## Build

`vite.tv.config.js` builds `tv.html`, which loads `tv/main.jsx` and then the
app's own `src/main.jsx`. It differs from the web build in four ways:

- **One classic script.** A widget loads from its installed package, where
  module scripts and lazy chunks are unreliable, so every dynamic import is
  inlined and the output is an IIFE with relative URLs.
- **Chromium 85.** 2021 Samsung sets run Tizen 6.5, whose engine is Chromium
  85. Syntax is compiled to that target; `tv/lib/polyfills.js` supplies the
  newer runtime APIs the app calls (`AbortSignal.timeout`, `Array.prototype.at`,
  `Object.hasOwn`, `crypto.randomUUID`).
- **A lowered stylesheet.** `tv/build/cssCompat.js` rewrites what Chromium 85
  would drop from Tailwind v4's output: cascade layers (emulated with
  specificity), `:where()`/`:is()`, `:focus-visible`, individual transform
  properties, `inset`, and dynamic viewport units. The build fails if
  anything unsupported remains outside an `@supports` or `@container` block.
- **10-foot sizing.** `tv.html` declares a 1280px viewport, so the set lays
  out the desktop app at 1.5 device pixels per CSS pixel.

`VITE_TV=1` is defined for the build; `IS_TV_BUILD` in `src/lib/nav.js` gates
the omissions above.

```sh
npm run build:tv    # dist-tv/
```

To check navigation without a TV, serve `dist-tv/` and open `tv.html` at a
1280x720 window. Arrow keys and Enter behave as on the remote; dispatch a
`keydown` with `keyCode` 10009 for Back and 403 for Red.

## Sign and install

Prerequisites, on a Windows host with WSL:

- Tizen Studio with the Samsung TV extension (default `C:\tizen-studio`);
- a Samsung certificate profile whose distributor certificate lists the TV's
  DUID;
- Developer Mode on the TV, with this computer's IP as the host.

```sh
TIZEN_PROFILE=<profile> scripts/tizen_tv.sh                         # public data
TIZEN_PROFILE=<profile> scripts/tizen_tv.sh --family <full sha>     # family books
TIZEN_PROFILE=<profile> TIZEN_TV=<tv-ip> scripts/tizen_tv.sh --family <full sha> --install
```

`--family` builds the family edition, with the same release rules as
`scripts/deploy_family.sh`: a clean checkout of the named commit, focused
release checks, the sync capability read from its file and never passed on a
command line, and the signed widget written with owner-only permissions.
`--install` also launches the app on the TV. Raise `version` in
`tizen/config.xml` for each release.

## Debug on the TV

```sh
sdb -s <tv-ip>:26101 shell 0 debug TickrTape1.TickerTapeTV   # prints a port
sdb -s <tv-ip>:26101 forward tcp:9333 tcp:<port>
```

Then open `http://localhost:9333` in Chrome for the web inspector.
