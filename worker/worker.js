/**
 * Cloudflare Worker — Yahoo Finance CORS proxy with crumb auth.
 * Handles Yahoo's cookie/crumb mechanism for v7/v10 endpoints.
 * v8/chart works without auth, v7/v10 need cookies+crumb.
 *
 * Deploy: npx wrangler deploy
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// The one POST endpoint we proxy: Yahoo's visualization API, which backs the
// earnings calendar (historical report dates). Everything else stays GET-only.
const POST_PATH = '/v1/finance/visualization';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Cache crumb + cookies in Worker memory (persists within instance lifetime)
let _crumb = null;
let _cookies = null;
let _crumbTs = 0;
const CRUMB_TTL = 3600 * 1000; // refresh crumb every hour

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }
        const url = new URL(request.url);
        const path = url.pathname;

        if (request.method === 'POST') {
            if (path !== POST_PATH) return jsonResp({ error: 'Method not allowed' }, 405);
            try {
                return await proxyWithCrumb(path, url.search, await request.text());
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

        if (!path.startsWith('/v1/') && !path.startsWith('/v7/') && !path.startsWith('/v8/') && !path.startsWith('/v10/') && !path.startsWith('/ws/')) {
            return jsonResp({ error: 'Use /v1/, /v7/, /v8/, /v10/ endpoints' }, 400);
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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    });
}

/** Proxy with crumb+cookies (v7, v10 GETs; visualization POST when body given). */
async function proxyWithCrumb(path, search, body = null) {
    // Ensure we have a valid crumb
    if (!_crumb || !_cookies || Date.now() - _crumbTs > CRUMB_TTL) {
        const ok = await refreshCrumb();
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
        const ok = await refreshCrumb();
        if (!ok) return jsonResp({ error: 'Yahoo auth failed after refresh' }, 502);
        resp = await doFetch();
    }

    if (!resp.ok) return jsonResp({ error: `Yahoo returned ${resp.status}` }, resp.status);

    return new Response(await resp.text(), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
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

function jsonResp(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}
