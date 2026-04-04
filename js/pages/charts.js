/**
 * charts.js — Candlestick + volume charts via TradingView lightweight-charts.
 * Data source: data/charts/{SYM}.json. All content from trusted pipeline.
 */
let _lwcLoaded = false;
function loadLWC() {
    if (_lwcLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
        script.onload = () => { _lwcLoaded = true; resolve(); };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

App.registerPage('charts', async function(container, data, params) {
    const symbol = params.symbol;
    const chartData = data[`charts/${symbol}.json`];

    if (!chartData) {
        container.innerHTML = `<div class="text-dim p-4">No chart data for ${symbol}. <a href="#/">Back</a></div>`;
        return;
    }

    try { await loadLWC(); } catch {
        container.innerHTML = '<div class="text-dim p-4">Failed to load charting library.</div>';
        return;
    }

    const timeframes = ['1d', '5d', '1mo', '3mo', '1y', '5y'];
    const labels = { '1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '1y': '1Y', '5y': '5Y' };
    let activeTF = '1mo';

    let html = `<h5 class="text-accent mb-3">${Utils.symLink(symbol, 'lookup')} \u2014 Chart</h5>`;
    html += '<div class="chart-container">';
    html += '<div class="chart-timeframes" id="chart-tf">';
    for (const tf of timeframes) {
        html += `<button class="btn${tf === activeTF ? ' active' : ''}" data-tf="${tf}">${labels[tf]}</button>`;
    }
    html += '</div><div id="chart-area" style="width:100%;height:400px"></div></div>';
    html += `<div class="mt-3"><a href="#/ta/${symbol}" class="btn btn-sm btn-outline-secondary me-2">Technicals</a>`;
    html += `<a href="#/lookup/${symbol}" class="btn btn-sm btn-outline-secondary">Fundamentals</a></div>`;

    container.innerHTML = html;

    function renderChart(tf) {
        const area = document.getElementById('chart-area');
        area.replaceChildren();
        const ohlcv = chartData[tf];
        if (!ohlcv || !ohlcv.length) { area.textContent = 'No data for this timeframe.'; return; }

        const chart = LightweightCharts.createChart(area, {
            width: area.clientWidth, height: 400,
            layout: { background: { color: '#1a1a2e' }, textColor: '#666', fontSize: 11 },
            grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#333' },
            timeScale: { borderColor: '#333', timeVisible: tf === '1d' || tf === '5d' },
        });

        const cs = chart.addCandlestickSeries({
            upColor: '#00c853', downColor: '#ff1744',
            borderUpColor: '#00c853', borderDownColor: '#ff1744',
            wickUpColor: '#00c853', wickDownColor: '#ff1744',
        });
        cs.setData(ohlcv.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));

        const vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        vs.setData(ohlcv.map(d => ({
            time: d.time, value: d.volume,
            color: d.close >= d.open ? 'rgba(0,200,83,0.3)' : 'rgba(255,23,68,0.3)',
        })));

        chart.timeScale().fitContent();
        new ResizeObserver(() => chart.applyOptions({ width: area.clientWidth })).observe(area);
    }

    renderChart(activeTF);
    document.getElementById('chart-tf').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tf]');
        if (!btn) return;
        document.querySelectorAll('#chart-tf .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderChart(btn.dataset.tf);
    });
});
