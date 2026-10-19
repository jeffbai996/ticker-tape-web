// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { googleArticleId, googleBatchUrl, resolveGoogleArticle } from '../../worker/google_news.js'
import { publicArticleUrl } from '../../worker/reader.js'
import { decodeArticleHtml, readArticleResponse } from '../../worker/article_fetch.js'

const opaque = 'AU_yqLExampleSignedArticleIdentifier_12345'
const url = `https://news.google.com/rss/articles/${opaque}?oc=5`
const options = () => ({signal:AbortSignal.timeout(1000),allowed:publicArticleUrl})
const response = destination => `)]}'\n\n${JSON.stringify([['wrb.fr','Fbv4je',JSON.stringify(['garturlres',destination])]])}`

it('permits only Google article IDs and known Chinese publisher destinations', () => {
  expect(googleArticleId(url)).toBe(opaque)
  for (const bad of ['https://news.google.com/search?q=anything','https://news.google.com.evil.test/articles/'+opaque,'http://news.google.com/rss/articles/'+opaque]) expect(googleArticleId(bad)).toBeNull()
  expect(publicArticleUrl('http://www.geekpark.net/news/123')).toBe('https://www.geekpark.net/news/123')
  expect(publicArticleUrl('https://www.finet.hk/newscenter/story')).toBeTruthy()
  expect(googleBatchUrl(response('https://127.0.0.1/private'),publicArticleUrl)).toBeNull()
  expect(googleBatchUrl(response('https://finet.hk.evil.test/a'),publicArticleUrl)).toBeNull()
})

it('resolves signed Google IDs and validates the returned publisher before fetching it', async () => {
  const fetcher=vi.fn()
    .mockResolvedValueOnce(new Response('<div data-n-a-sg="signed-value" data-n-a-ts="1700000000"></div>'))
    .mockResolvedValueOnce(new Response(response('https://www.finet.hk/newscenter/story')))
  expect(await resolveGoogleArticle(url,fetcher,options())).toBe('https://www.finet.hk/newscenter/story')
  expect(fetcher.mock.calls[1][0]).toBe('https://news.google.com/_/DotsSplashUi/data/batchexecute')
  expect(fetcher.mock.calls[1][1].method).toBe('POST')
  for (const [,request] of fetcher.mock.calls) expect(request.headers).not.toHaveProperty('Authorization')
})

it('decodes legacy IDs without contacting Google', async () => {
  const id=btoa('\x08\x13\x22https://www.finet.hk/newscenter/story\x00').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  const fetcher=vi.fn()
  expect(await resolveGoogleArticle(`https://news.google.com/articles/${id}`,fetcher,options())).toBe('https://www.finet.hk/newscenter/story')
  expect(fetcher).not.toHaveBeenCalled()
})

it('refuses redirects from Google to private hosts', async () => {
  const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/'}}))
  expect(await resolveGoogleArticle(url,fetcher,options())).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('decodes Big5 Chinese from either the response header or the HTML declaration', () => {
  // Generic fixture text encoded as Big5: 公司公告。
  const bytes=Uint8Array.from([164,189,165,113,164,189,167,105,161,67])
  expect(decodeArticleHtml(bytes,'text/html; charset=big5')).toBe('公司公告。')
  const prefix=new TextEncoder().encode('<meta charset="big5">')
  const html=new Uint8Array(prefix.length+bytes.length);html.set(prefix);html.set(bytes,prefix.length)
  expect(decodeArticleHtml(html)).toContain('公司公告。')
})

it('caps streamed responses even when Content-Length is absent', async () => {
  await expect(readArticleResponse(new Response(new Uint8Array(1_500_001)))).rejects.toThrow('article too large')
})

it('tries the alternate Google article wrapper when the first returns a temporary refusal', async () => {
  const fetcher=vi.fn()
    .mockResolvedValueOnce(new Response('',{status:503}))
    .mockResolvedValueOnce(new Response('<div data-n-a-sg="signed" data-n-a-ts="1700000000"></div>'))
    .mockResolvedValueOnce(new Response(response('https://www.finet.hk/newscenter/story')))
  expect(await resolveGoogleArticle(url,fetcher,options())).toBe('https://www.finet.hk/newscenter/story')
  expect(new URL(fetcher.mock.calls[0][0]).pathname).toContain('/articles/')
  expect(fetcher.mock.calls[1][0]).not.toBe(fetcher.mock.calls[0][0])
})
