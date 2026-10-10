# Ticker Tape for Samsung TV

A Tizen web widget built from `tv/`: a 1920×1080 market board for the remote.
It shows the watchlist, a markets rail, wire headlines from the public mirror,
and a scrolling tape, and opens a full-screen chart on OK. It reads the same
public data path as the web app (the Cloudflare Worker and Yahoo's price
stream) through the shared modules in `src/lib/`, and carries no account data.

## Remote

| Key | Action |
| --- | --- |
| ▲ ▼ | Move through the watchlist or the markets rail |
| ◀ ▶ | Switch between watchlist and markets; in a chart, change the range |
| CH ▲ / CH ▼ | Page the watchlist |
| OK | Open the chart; ▲ ▼ inside a chart step to the previous or next symbol |
| Green | Add a symbol (opens the on-screen keyboard) |
| Red | Remove the focused symbol, after confirmation |
| Yellow | Sort by list order, top gainers or top losers |
| Back | Close the chart or dialog; on the board, exit |

The watchlist and sort mode persist in widget storage on the TV.

## Runtime target

2021 Samsung sets run Tizen 6.5, whose web engine is Chromium 85. The TV build
therefore:

- uses plain CSS (`tv/tv.css`) instead of Tailwind v4, whose output requires
  Chromium 111;
- compiles to a single classic script with `target: 'chrome85'`
  (`vite.tv.config.js`);
- installs runtime shims for APIs newer than Chromium 85 that the shared data
  layer calls, such as `AbortSignal.timeout` (`tv/lib/polyfills.js`).

Check new shared-module dependencies against Chromium 85 before the TV build
imports them.

## Develop

```sh
npm run dev:tv      # http://localhost:5173, scaled to fit the window
npm run build:tv    # dist-tv/
```

In a desktop browser, arrow keys, Enter and Escape stand in for the remote,
and `r`, `g`, `y` stand in for the colour keys.

## Sign and install

Prerequisites, on a Windows host with WSL:

- Tizen Studio with the Samsung TV extension (default `C:\tizen-studio`);
- a Samsung certificate profile whose distributor certificate lists the TV's
  DUID;
- Developer Mode on the TV, with this computer's IP as the host.

```sh
TIZEN_PROFILE=<profile> scripts/tizen_tv.sh                       # sign only
TIZEN_PROFILE=<profile> TIZEN_TV=<tv-ip> scripts/tizen_tv.sh --install
```

The script builds `dist-tv`, signs it in a Windows temp directory (the Windows
signer rejects WSL paths), checks that the widget carries both signatures and
the `config.xml` version, writes `dist-tizen/TickerTapeTV-<version>.wgt`, then
installs and launches it. Raise `version` in `tizen/config.xml` for each
release.

## Debug on the TV

```sh
sdb -s <tv-ip>:26101 shell 0 debug TickrTape1.TickerTapeTV   # prints a port
sdb -s <tv-ip>:26101 forward tcp:9333 tcp:<port>
```

Then open `http://localhost:9333` in Chrome for the web inspector.
