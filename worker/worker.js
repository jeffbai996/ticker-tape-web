/**
 * Cloudflare Worker — Yahoo Finance CORS proxy with crumb auth.
 * Handles Yahoo's cookie/crumb mechanism for v7/v10 endpoints.
 * v8/chart works without auth, v7/v10 need cookies+crumb.
 *
 * Deploy: npx wrangler deploy
 */

import { handleWatchlists } from './watchlists.js'
import { handlePortfolios } from './portfolios.js'
import { handleWire } from './wire.js'
export { CapDocCoordinator } from './capdoc.js'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// The one POST endpoint we proxy: Yahoo's visualization API, which backs the
// earnings calendar (historical report dates). Everything else stays GET-only.
const POST_PATH = '/v1/finance/visualization';
const MAX_PROXY_BODY = 64 * 1024;
const MAX_PROXY_QUERY = 8 * 1024;
const SYMBOL_PATH = '[^/]{1,80}';
const YAHOO_GET_PATHS = [
    /^\/v1\/finance\/search$/,
    /^\/v7\/finance\/quote$/,
    new RegExp(`^/v7/finance/options/${SYMBOL_PATH}$`),
    new RegExp(`^/v8/finance/chart/${SYMBOL_PATH}$`),
    new RegExp(`^/v10/finance/quoteSummary/${SYMBOL_PATH}$`),
    new RegExp(`^/ws/fundamentals-timeseries/v1/finance/timeseries/${SYMBOL_PATH}$`),
];

export function allowedYahooGetPath(path) {
    return YAHOO_GET_PATHS.some((pattern) => pattern.test(path));
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Cache crumb + cookies in Worker memory (persists within instance lifetime)
let _crumb = null;
let _cookies = null;
let _crumbTs = 0;
const CRUMB_TTL = 3600 * 1000; // refresh crumb every hour

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Paid AI lives only behind the private tailnet service. The public
        // market-data Worker must never grow a second, unauthenticated route.
        if (path === '/chat' || path.startsWith('/chat/')) {
            return jsonResp({ error: 'Not found' }, 404);
        }

        // Public watchlist sync is capability-scoped and intentionally does
        // not proxy the private Fragwire API.
        if (path === '/watchlists' || path.startsWith('/watchlists/')) {
            return handleWatchlists(request, env, path);
        }
        if (path === '/portfolios' || path.startsWith('/portfolios/')) {
            return handlePortfolios(request, env, path);
        }

        // Public wire mirror: a pushed, sanitized headline snapshot read by
        // the public site. Read-only for everyone but the pusher.
        if (path === '/wire' || path.startsWith('/wire/')) {
            return handleWire(request, env, path);
        }

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method === 'POST') {
            if (path !== POST_PATH) return jsonResp({ error: 'Method not allowed' }, 405);
            const declared = Number(request.headers.get('Content-Length'));
            if (Number.isFinite(declared) && declared > MAX_PROXY_BODY) {
                return jsonResp({ error: 'Request too large' }, 413);
            }
            try {
                const body = await request.text();
                if (body.length > MAX_PROXY_BODY) return jsonResp({ error: 'Request too large' }, 413);
                return await proxyWithCrumb(path, url.search, body);
            } catch (err) {
                return jsonResp({ error: `Proxy error: ${err.message}` }, 502);
            }
        }
        if (request.method !== 'GET') {
            return jsonResp({ error: 'Method not allowed' }, 405);
        }

        if (path === '/' || path === '/health') {
            return jsonResp({ status: 'ok', proxy: 'yf-cors' });
        }

        // SEC EDGAR pass-through — sec.gov sends no CORS headers, and its
        // fair-access policy wants a declared contact UA. Two endpoints only.
        if (path === '/sec/tickers') {
            return proxySec('https://www.sec.gov/files/company_tickers.json', 86400);
        }
        if (path.startsWith('/sec/submissions/')) {
            const name = path.slice('/sec/submissions/'.length);
            if (!/^CIK\d{10}\.json$/.test(name)) return jsonResp({ error: 'bad CIK' }, 400);
            return proxySec(`https://data.sec.gov/submissions/${name}`, 600);
        }

        // Chinese-language market data for HK / mainland listings — Yahoo
        // carries none (its search ignores CJK, its profiles are English).
        // Three bounded GET routes against East Money, edge-cached; the
        // upstream never sees a client header (Gordon, 2026-08-22).
        if (path.startsWith('/cn/')) {
            return handleCn(path, url);
        }

        if (!allowedYahooGetPath(path)) {
            return jsonResp({ error: 'Unsupported market-data route' }, 404);
        }
        if (url.search.length > MAX_PROXY_QUERY) {
            return jsonResp({ error: 'Query too large' }, 414);
        }

        try {
            // v1 (search/news) and v8 (chart) endpoints don't need crumb auth
            if (path.startsWith('/v1/') || path.startsWith('/v8/')) {
                return await proxyDirect(path, url.search);
            }

            // v7/v10 need crumb+cookies
            return await proxyWithCrumb(path, url.search);
        } catch (err) {
            return jsonResp({ error: `Proxy error: ${err.message}` }, 502);
        }
    },
};

/** Proxy without auth (v8 chart endpoint). */
async function proxyDirect(path, search) {
    const resp = await fetch(`https://query1.finance.yahoo.com${path}${search}`, {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Referer': 'https://finance.yahoo.com/',
            'Origin': 'https://finance.yahoo.com',
        },
    });

    if (!resp.ok) return jsonResp({ error: `Yahoo returned ${resp.status}` }, resp.status);

    return new Response(await resp.text(), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': quoteCacheControl(path) },
    });
}

// Single-flight: N concurrent 401s must share ONE refresh, not stampede
// Yahoo's getcrumb endpoint (which rate-limits and then everyone fails).
let _refreshing = null;
function refreshCrumbOnce() {
    if (!_refreshing) {
        _refreshing = refreshCrumb().finally(() => { _refreshing = null; });
    }
    return _refreshing;
}

/** Proxy with crumb+cookies (v7, v10 GETs; visualization POST when body given). */
async function proxyWithCrumb(path, search, body = null) {
    // Ensure we have a valid crumb
    if (!_crumb || !_cookies || Date.now() - _crumbTs > CRUMB_TTL) {
        const ok = await refreshCrumbOnce();
        if (!ok) return jsonResp({ error: 'Failed to obtain Yahoo auth crumb' }, 502);
    }

    const sep = search ? '&' : '?';
    const doFetch = () => fetch(
        `https://query1.finance.yahoo.com${path}${search}${sep}crumb=${encodeURIComponent(_crumb)}`,
        {
            method: body != null ? 'POST' : 'GET',
            body: body ?? undefined,
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Referer': 'https://finance.yahoo.com/',
                'Origin': 'https://finance.yahoo.com',
                'Cookie': _cookies,
                ...(body != null ? { 'Content-Type': 'application/json' } : {}),
            },
        },
    );

    let resp = await doFetch();

    // If 401, crumb might be stale — refresh once and retry
    if (resp.status === 401) {
        const ok = await refreshCrumbOnce();
        if (!ok) return jsonResp({ error: 'Yahoo auth failed after refresh' }, 502);
        resp = await doFetch();
    }

    if (!resp.ok) return jsonResp({ error: `Yahoo returned ${resp.status}` }, resp.status);

    return new Response(await resp.text(), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': quoteCacheControl(path) },
    });
}

/** Fetch Yahoo session cookies + crumb. */
async function refreshCrumb() {
    try {
        // Step 1: Hit fc.yahoo.com to get session cookies
        const cookieResp = await fetch('https://fc.yahoo.com/', {
            headers: { 'User-Agent': UA },
            redirect: 'manual',
        });

        // Extract Set-Cookie headers
        const setCookies = cookieResp.headers.getAll?.('set-cookie')
            || [cookieResp.headers.get('set-cookie')].filter(Boolean);

        // Parse cookie names+values
        const cookies = setCookies
            .map(c => c.split(';')[0])
            .filter(Boolean)
            .join('; ');

        if (!cookies) {
            // Fallback: try consent page
            const consentResp = await fetch('https://guce.yahoo.com/consent', {
                headers: { 'User-Agent': UA },
                redirect: 'manual',
            });
            const fallbackCookies = [consentResp.headers.get('set-cookie')].filter(Boolean)
                .map(c => c.split(';')[0]).join('; ');
            if (fallbackCookies) _cookies = fallbackCookies;
        } else {
            _cookies = cookies;
        }

        // Step 2: Fetch crumb using the cookies
        const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: {
                'User-Agent': UA,
                'Cookie': _cookies,
                'Referer': 'https://finance.yahoo.com/',
            },
        });

        if (!crumbResp.ok) return false;

        _crumb = await crumbResp.text();
        _crumbTs = Date.now();

        return !!_crumb && _crumb.length > 0 && !_crumb.includes('<');
    } catch (e) {
        console.error('Crumb refresh failed:', e);
        return false;
    }
}

async function proxySec(target, maxAge) {
    try {
        const resp = await fetch(target, {
            headers: {
                'User-Agent': 'ticker-tape-web research (contact: jeffbai996.github.io)',
                'Accept': 'application/json',
            },
        });
        if (!resp.ok) return jsonResp({ error: `SEC returned ${resp.status}` }, resp.status);
        return new Response(await resp.text(), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json',
                       'Cache-Control': `public, max-age=${maxAge}` },
        });
    } catch (err) {
        return jsonResp({ error: `SEC proxy error: ${err.message}` }, 502);
    }
}

/** The v7 quote batch is a LIVE print the app re-requests on a fixed cadence
 *  with an identical URL — under `max-age=30` the browser's HTTP cache served
 *  the previous sweep back for up to 30s, so a 30s sweep read as a 60s one
 *  and the visibility re-sweep showed nothing new (2026-08-18). Prints are
 *  never cached; charts / fundamentals / search keep 30s. */
export function quoteCacheControl(path) {
    return path.startsWith('/v7/finance/quote') ? 'no-store' : 'public, max-age=30';
}

function jsonResp(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}


// ── /cn/* — East Money pass-through for Chinese names, news, profiles ──

const CN_UA = 'Mozilla/5.0';
const CN_TTL = { news: 600, profile: 86400, industry: 86400, report: 21600, f10: 21600, read: 86400 };
// Article pages the reader may open: East Money's own story URLs only.
const READ_URL = /^https?:\/\/(?:finance|stock|fund|futures|forex|bond|www)\.eastmoney\.com\/a\/\d{12,}\.html$/;
const MAX_ARTICLE_BYTES = 1_000_000;

const strip = (html) => String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;|\u3000/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').trim();

/** East Money story page → {title, time, source, paras}. Pure; exported for tests. */
export function extractEmArticle(html) {
    const h = String(html || '');
    const title = strip((/<title>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '').replace(/\s*[_|-]\s*东方财富.*$/, '').trim();
    const time = (/(\d{4}年\d{2}月\d{2}日 \d{2}:\d{2})/.exec(h) || [])[1] || '';
    const bodyStart = h.search(/<div[^>]+id="ContentBody"[^>]*>/i);
    let paras = [];
    let source = '';
    if (bodyStart >= 0) {
        const body = h.slice(bodyStart, bodyStart + 200_000)
            .replace(/<div[^>]+class="ad_[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');      // in-body ad slots
        const m = /文章来源[：:]\s*([^）)<]+)/.exec(body);
        if (m) source = strip(m[1]);
        // the source line ends the story; the share widget and editor credit
        // that follow are page chrome
        for (const x of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
            const t = strip(x[1]);
            if (/^[（(]?文章来源/.test(t) || /打开微信|微信扫一扫|扫描二维码|^[（(]?责任编辑/.test(t)) break;
            if (t && t.length > 1) paras.push(t);
        }
    }
    return { title, time, source, paras };
}
// East Money datacenter reports the app may ask for, by code — corporate
// actions only (dividends, results dates). Anything else is a 404.
const CN_REPORTS = {
    a_dividends: { name: 'RPT_SHAREBONUS_DET', sort: 'EX_DIVIDEND_DATE', code: (sec) => sec.code },
    a_results: { name: 'RPT_PUBLIC_BS_APPOIN', sort: 'REPORT_DATE', code: (sec) => sec.code },
    hk_dividends: { name: 'RPT_HKF10_INFO_DIVIDEND', sort: 'NOTICE_DATE', code: (sec) => sec.code },
    // standardised HK statements, long format: one row per line item per period
    hk_income: { name: 'RPT_HKF10_FN_INCOME_PC', sort: 'REPORT_DATE', code: (sec) => sec.code, max: 1500 },
    hk_balance: { name: 'RPT_HKF10_FN_BALANCE_PC', sort: 'REPORT_DATE', code: (sec) => sec.code, max: 1500 },
    hk_cashflow: { name: 'RPT_HKF10_FN_CASHFLOW_PC', sort: 'REPORT_DATE', code: (sec) => sec.code, max: 1500 },
};
const CN_F10 = { lrb: 'lrbAjaxNew', zcfzb: 'zcfzbAjaxNew', xjllb: 'xjllbAjaxNew' };
const F10_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validated upstream for a mainland statement pull, or null. Pure. */
export function cnF10Upstream({ stmt, market, code, ct, reportType, dates }) {
    const page = CN_F10[stmt];
    const n = Number(ct);
    const rt = Number(reportType) || 1;
    const list = String(dates || '').split(',').filter(Boolean);
    if (!page || !(market === 'sh' || market === 'sz') || !/^\d{6}$/.test(code || '')) return null;
    if (!Number.isInteger(n) || n < 1 || n > 4 || (rt !== 1 && rt !== 2)) return null;
    if (!list.length || list.length > 8 || !list.every((d) => F10_DATE.test(d))) return null;
    return `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/${page}?companyType=${n}&reportDateType=0&reportType=${rt}&dates=${list.join(',')}&code=${market.toUpperCase()}${code}`;
}

/** "0700.HK" → {market:'hk', code:'00700'}; "600036.SS" → {market:'sh', code}; "000630.SZ" → sz. */
export function cnSecurity(symbol) {
    const m = /^(\d{1,6})\.(HK|SS|SZ)$/i.exec(String(symbol || '').trim().toUpperCase());
    if (!m) return null;
    const [, digits, venue] = m;
    if (venue === 'HK') return digits.length <= 5 ? { market: 'hk', code: digits.padStart(5, '0') } : null;
    if (digits.length !== 6) return null;
    return { market: venue === 'SS' ? 'sh' : 'sz', code: digits };
}

async function handleCn(path, url) {
    const kind = path.slice('/cn/'.length);
    if (!(kind in CN_TTL)) return jsonResp({ error: 'Unsupported cn route' }, 404);
    if (url.search.length > 512) return jsonResp({ error: 'Query too large' }, 414);

    let upstream;
    if (kind === 'news') {
        // search by the listing's Chinese name, the way the client knows it
        const q = (url.searchParams.get('q') || '').trim();
        const n = Math.min(20, Math.max(1, Number(url.searchParams.get('n')) || 8));
        if (!q || q.length > 40) return jsonResp({ error: 'bad q' }, 400);
        const param = JSON.stringify({
            uid: '', keyword: q, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web',
            clientVersion: 'curr',
            param: { cmsArticleWebOld: { searchScope: 'default', sort: 'default', pageIndex: 1, pageSize: n, preTag: '', postTag: '' } },
        });
        upstream = `https://search-api-web.eastmoney.com/search/jsonp?cb=&param=${encodeURIComponent(param)}`;
    } else {
        if (kind === 'read') {
            const target = String(url.searchParams.get('url') || '');
            if (!READ_URL.test(target)) return jsonResp({ error: 'bad url' }, 400);
            const cache = caches.default;
            const key = new Request(`https://cn-cache.invalid/read?u=${encodeURIComponent(target)}`);
            const hit = await cache.match(key);
            if (hit) return hit;
            let resp;
            try {
                resp = await fetch(target, { headers: { 'User-Agent': CN_UA, 'Accept': 'text/html', 'Referer': 'https://www.eastmoney.com/' }, redirect: 'follow' });
            } catch (err) {
                return jsonResp({ error: `read upstream: ${err.message}` }, 502);
            }
            if (!resp.ok) return jsonResp({ error: `read upstream HTTP ${resp.status}` }, 502);
            const raw = await resp.arrayBuffer();
            if (raw.byteLength > MAX_ARTICLE_BYTES) return jsonResp({ error: 'article too large' }, 502);
            const html = new TextDecoder('utf-8').decode(raw);
            const article = extractEmArticle(html);
            if (!article.paras.length) return jsonResp({ error: 'no article body' }, 502);
            const out = new Response(JSON.stringify({ ...article, url: target }), {
                status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CN_TTL.read}`, ...CORS_HEADERS },
            });
            await cache.put(key, out.clone());
            return out;
        }
        const sec = cnSecurity(url.searchParams.get('symbol'));
        if (!sec) return jsonResp({ error: 'bad symbol' }, 400);
        if (kind === 'f10') {
            upstream = cnF10Upstream({
                stmt: url.searchParams.get('stmt'), market: sec.market, code: sec.code,
                ct: url.searchParams.get('ct'), reportType: url.searchParams.get('rt'), dates: url.searchParams.get('dates'),
            });
            if (!upstream) return jsonResp({ error: 'bad f10 query' }, 400);
        } else if (kind === 'report') {
            const rep = CN_REPORTS[url.searchParams.get('report') || ''];
            if (!rep) return jsonResp({ error: 'bad report' }, 400);
            const n = Math.min(rep.max || 12, Math.max(1, Number(url.searchParams.get('n')) || 8));
            upstream = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=' + rep.name
                + '&columns=ALL&filter=' + encodeURIComponent(`(SECURITY_CODE="${rep.code(sec)}")`)
                + '&sortColumns=' + rep.sort + '&sortTypes=-1&pageSize=' + n + '&source=WEB&client=WEB';
        } else if (kind === 'industry' && sec.market === 'hk') {
            // the F10 profile carries 所属行业 (gszl.sshy) and its host is
            // reliable from Cloudflare; push2 (f127) started 502ing every
            // request on 2026-08-23 and was dropped
            upstream = `https://emweb.securities.eastmoney.com/PC_HKF10/CompanyProfile/PageAjax?code=${sec.code}`;
        } else if (kind === 'industry') {
            // mainland: the company survey carries the industry (EM2016) and
            // the F10 host does not throttle the way push2 does
            upstream = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${sec.market.toUpperCase()}${sec.code}`;
        } else if (sec.market === 'hk') {
            upstream = `https://emweb.securities.eastmoney.com/PC_HKF10/CompanyProfile/PageAjax?code=${sec.code}`;
        } else {
            upstream = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${sec.market.toUpperCase()}${sec.code}`;
        }
    }

    const cache = caches.default;
    const cacheKey = new Request(`https://cn-cache.invalid${path}${url.search}`);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let resp;
    try {
        // the search endpoint is jsonp-shaped and 406s on an Accept: json
        resp = await fetch(upstream, { headers: { 'User-Agent': CN_UA, 'Accept': '*/*', 'Referer': kind === 'news' ? 'https://so.eastmoney.com/' : 'https://www.eastmoney.com/' } });
    } catch (err) {
        return jsonResp({ error: `cn upstream: ${err.message}` }, 502);
    }
    if (!resp.ok) return jsonResp({ error: `cn upstream HTTP ${resp.status}` }, 502);
    const text = await resp.text();
    const out = new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CN_TTL[kind]}`, ...CORS_HEADERS },
    });
    await cache.put(cacheKey, out.clone());
    return out;
}
