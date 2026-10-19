// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { fetchGatewayArticle } from '../../worker/article_gateway.js'
import { publicArticleUrl } from '../../worker/reader.js'
const env={FAMILY_AI_ORIGIN:'https://gateway.example.test',FAMILY_AI_GATEWAY_TOKEN:'gateway-secret'}

it('fetches public article text through the configured authenticated gateway',async()=>{
 const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Published Chinese article.',resolved_url:'https://www.finet.hk/story',truncated:false,private:'excluded'}))
 const out=await fetchGatewayArticle('https://news.google.com/articles/ExampleArticleIdentifier123',env,fetcher,publicArticleUrl)
 expect(out).toEqual({text:'Published Chinese article.',resolved_url:'https://www.finet.hk/story',truncated:false})
 expect(fetcher.mock.calls[0][0]).toBe('https://gateway.example.test/api/article')
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer gateway-secret')
})

it('does not follow gateway redirects or trust unsupported returned destinations',async()=>{
 const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Hidden',resolved_url:'https://127.0.0.1/private'}))
 expect(await fetchGatewayArticle('https://www.finet.hk/story',env,fetcher,publicArticleUrl)).toBeNull()
 expect(fetcher.mock.calls[0][1].redirect).toBe('manual')
})

it('does not accept new reader work while the gateway is draining',async()=>{
 const fetcher=vi.fn()
 expect(await fetchGatewayArticle('https://www.finet.hk/story',{...env,FAMILY_AI_DRAIN:'1'},fetcher,publicArticleUrl)).toBeNull()
 expect(fetcher).not.toHaveBeenCalled()
})
