#!/usr/bin/env python3
"""Generate src/lib/zhNames.data.json — Chinese names for every HK / Shanghai /
Shenzhen listing, from the exchanges' own lists. Stdlib only.

Why generated: Yahoo's search returns nothing for a Chinese query (verified
at the source 2026-08-22), and a hand-kept table does not scale past the
names one person happens to know. The exchanges publish the authoritative
lists; this script folds them into one file the app ships.

Sources (public, no keys):
  HKEX   ListOfSecurities.xlsx (English) + ListOfSecurities_c.xlsx (繁體)
  HK 简体  qt.gtimg.cn batch quotes (the HK board in simplified Chinese)
  SSE    query.sse.com.cn company list, main board + STAR (简体)
  SZSE   szse.cn ShowReport CATALOGID=1110 (简体)
  ETFs   Sina etf_hq_fund node — every mainland ETF, both exchanges (简体)

Output: {"0700.HK": ["腾讯控股", "騰訊控股"], "600036.SS": ["招商银行"], …}
— simplified first, traditional second only when it differs.

Run:  python3 scripts/gen_zh_names.py   (then commit the JSON)
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'src' / 'lib' / 'zhNames.data.json'
UA = {'User-Agent': 'Mozilla/5.0', 'Accept': '*/*'}
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def fetch(url: str, timeout: int = 90, referer: str | None = None) -> bytes:
    # each exchange wants to see its own site as the referer, or it 403s
    headers = dict(UA)
    if referer:
        headers['Referer'] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def xlsx_rows(blob: bytes) -> list[list[str]]:
    """Every row of the first sheet; handles shared AND inline strings."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    shared: list[str] = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
                  for si in ET.parse(z.open('xl/sharedStrings.xml')).getroot()]
    sheet = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
    rows = []
    for row in ET.parse(z.open(sheet)).getroot().iter(NS + 'row'):
        vals = []
        for c in row.findall(NS + 'c'):
            t = c.get('t')
            v = c.find(NS + 'v')
            if t == 's' and v is not None:
                vals.append(shared[int(v.text)])
            elif t == 'inlineStr':
                vals.append(''.join(x.text or '' for x in c.iter(NS + 't')))
            else:
                vals.append(v.text if v is not None else '')
        rows.append(vals)
    return rows


def clean(name: str) -> str:
    # "万  科Ａ" → "万科A": exchanges pad short names and use full-width letters
    name = re.sub(r'\s+', '', name or '')
    # full-width Latin/digits (ＸＬ, Ａ) → ASCII, so a typed "A" matches 万科A
    return ''.join(chr(ord(ch) - 0xFEE0) if 0xFF01 <= ord(ch) <= 0xFF5E else ch for ch in name)


def hk_code(raw: str) -> str | None:
    digits = re.sub(r'\D', '', raw or '')
    if not digits:
        return None
    bare = digits.lstrip('0') or '0'
    return f'{bare.zfill(4)}.HK' if len(bare) <= 5 else None


def main() -> int:
    table: dict[str, list[str]] = {}

    # ── HKEX: traditional names, and the English list to keep only the
    #    equity/ETF/REIT lines (warrants and CBBCs are thousands of noise rows)
    eng = xlsx_rows(fetch('https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx'))
    chi = xlsx_rows(fetch('https://www.hkex.com.hk/chi/services/trading/securities/securitieslists/ListOfSecurities_c.xlsx'))
    keep = set()
    for r in eng[3:]:
        if len(r) >= 3 and r[2] in ('Equity', 'Exchange Traded Products', 'Real Estate Investment Trusts'):
            code = hk_code(r[0])
            if code:
                keep.add(code)
    trad: dict[str, str] = {}
    for r in chi[3:]:
        code = hk_code(r[0]) if r else None
        if code and code in keep and len(r) >= 2:
            trad[code] = clean(r[1])
    print(f'HKEX: {len(keep)} listings kept, {len(trad)} traditional names', file=sys.stderr)

    # ── Tencent quote batch: the same HK board in simplified Chinese. 60
    #    codes per request, GBK on the wire. (East Money's list API was the
    #    first choice and rate-limits to a closed connection — 2026-08-22.)
    simp_hk = 0
    codes = sorted(keep)
    for i in range(0, len(codes), 60):
        batch = codes[i:i + 60]
        q = ','.join('hk' + c[:-3].zfill(5) for c in batch)
        for attempt in range(3):
            try:
                text = fetch('https://qt.gtimg.cn/q=' + q, timeout=20).decode('gbk', 'replace')
                break
            except Exception as exc:         # noqa: BLE001 — retry the batch
                if attempt == 2:
                    raise
                print(f'gtimg batch {i} retry: {exc}', file=sys.stderr)
        for m in re.finditer(r'v_hk(\d{5})="\d+~([^~]*)~', text):
            code = hk_code(m.group(1))
            name = clean(m.group(2))
            if code in keep and name:
                table[code] = [name]
                simp_hk += 1
        time.sleep(0.25)
    for code, zht in trad.items():
        entry = table.setdefault(code, [zht])
        if zht and zht != entry[0]:
            entry.append(zht) if len(entry) == 1 else None
    print(f'HK simplified: {simp_hk}; HK total: {sum(1 for k in table if k.endswith(".HK"))}', file=sys.stderr)

    # ── SSE: main board (STOCK_TYPE=1) + STAR (8)
    for stock_type in ('1', '8'):
        url = ('https://query.sse.com.cn/sseQuery/commonQuery.do?STOCK_TYPE=' + stock_type +
               '&sqlId=COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L&COMPANY_STATUS=2,4,5,7,8&type=inParams'
               '&isPagination=true&pageHelp.pageSize=5000&pageHelp.pageNo=1')
        data = json.loads(fetch(url, referer='https://www.sse.com.cn/'))['pageHelp']['data']
        for d in data:
            code = re.sub(r'\D', '', d.get('A_STOCK_CODE', ''))
            if len(code) == 6:
                table[f'{code}.SS'] = [clean(d.get('SEC_NAME_CN', ''))]
    print(f'SSE: {sum(1 for k in table if k.endswith(".SS"))}', file=sys.stderr)

    # ── SZSE: one workbook, A股代码 / A股简称 columns
    rows = xlsx_rows(fetch('https://www.szse.cn/api/report/ShowReport?SHOWTYPE=xlsx&CATALOGID=1110&TABKEY=tab1',
                           referer='https://www.szse.cn/market/product/stock/list/index.html'))
    head = rows[0]
    ci, ni = head.index('A股代码'), head.index('A股简称')
    for r in rows[1:]:
        if len(r) > max(ci, ni):
            code = re.sub(r'\D', '', r[ci])
            if len(code) == 6 and r[ni]:
                table[f'{code}.SZ'] = [clean(r[ni])]
    print(f'SZSE: {sum(1 for k in table if k.endswith(".SZ"))}', file=sys.stderr)

    # ── Mainland ETFs: neither exchange's company list carries funds. Sina's
    #    ETF node lists every listed ETF on both exchanges with its name.
    etf_n = 0
    page = 1
    while True:
        url = ('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
               'Market_Center.getHQNodeData?page=%d&num=500&sort=symbol&asc=1&node=etf_hq_fund' % page)
        data = json.loads(fetch(url, timeout=60, referer='https://finance.sina.com.cn/') or b'[]')
        if not data:
            break
        for d in data:
            sym = str(d.get('symbol', ''))
            code = re.sub(r'\D', '', sym)
            if len(code) == 6 and sym[:2] in ('sh', 'sz') and d.get('name'):
                key = f"{code}.{'SS' if sym.startswith('sh') else 'SZ'}"
                table.setdefault(key, [clean(d['name'])])
                etf_n += 1
        page += 1
        time.sleep(0.3)
    print(f'mainland ETFs: {etf_n}', file=sys.stderr)

    table = {k: [n for n in v if n] for k, v in sorted(table.items()) if v and v[0]}
    OUT.write_text(json.dumps(table, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'wrote {OUT} — {len(table)} symbols, {OUT.stat().st_size // 1024} KB', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
