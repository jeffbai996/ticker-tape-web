import {constantTimeEqual} from './capdoc.js'
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization','Access-Control-Allow-Methods':'GET,OPTIONS'}
const fail=(error,status)=>Response.json({ok:false,error},{status,headers})

/** Fixed read-only route; portfolio data never enters the public wire cache. */
export async function handlePortfolioHistory(request,env,fetcher=fetch) {
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(request.method!=='GET')return fail('Method not allowed',405)
 if(!env.FAMILY_SYNC_TOKEN || !constantTimeEqual(request.headers.get('Authorization'),`Bearer ${env.FAMILY_SYNC_TOKEN}`))return fail('Unauthorized',401)
 const params=new URL(request.url).searchParams,book=params.get('book'),limit=params.get('limit') || '400'
 if(!/^p\d{1,9}$/.test(book || '') || !/^\d+$/.test(limit) || +limit<1 || +limit>1000 || [...params.keys()].some(k=>!['book','limit'].includes(k)))return fail('Invalid history request',400)
 let origin
 try {
  origin=new URL(env.FAMILY_AI_ORIGIN)
  if(origin.protocol!=='https:' || origin.pathname!=='/' || origin.username || origin.password || origin.search || origin.hash || !env.FAMILY_AI_GATEWAY_TOKEN)throw Error()
 }catch{return fail('History unavailable',503)}
 try {
  const response=await fetcher(`${origin.origin}/api/history?${new URLSearchParams({book,limit})}`,{headers:{Authorization:`Bearer ${env.FAMILY_AI_GATEWAY_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(10000)})
  if(!response.ok){await response.body?.cancel();return fail('History unavailable',502)}
  return new Response(response.body,{headers:{...headers,'Content-Type':'application/json'}})
 }catch{return fail('History unavailable',503)}
}
