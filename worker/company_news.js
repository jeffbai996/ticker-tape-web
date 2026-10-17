// Search results remain request-scoped. Only individual public company queries
// enter the existing edge cache; no book or company selection enters the wire.
const HEADERS = {
  'Content-Type':'application/json', 'Cache-Control':'private, no-store',
  'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
}
const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers:HEADERS})

export async function handleCompanyNews(request, search) {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:HEADERS})
  if (request.method !== 'POST') return reply({error:'Method not allowed'},405)
  if (Number(request.headers.get('Content-Length')) > 8192) return reply({error:'Request too large'},413)
  let queries
  try {
    const raw=await request.text()
    if (raw.length>8192) return reply({error:'Request too large'},413)
    queries=JSON.parse(raw)?.queries
  } catch { return reply({error:'Invalid request'},400) }
  if (!Array.isArray(queries) || queries.length>12 || queries.some(q=>typeof q!=='string' || !q.trim() || q.length>40)) {
    return reply({error:'Invalid company queries'},400)
  }
  queries=[...new Set(queries.map(q=>q.trim()))]
  const results=new Array(queries.length)
  const signal=AbortSignal.timeout(10_000)
  let next=0
  // Six concurrent upstream reads, one deadline for the entire batch. Cached
  // results are reused by the same bounded /cn/news implementation.
  await Promise.all(Array.from({length:Math.min(6,queries.length)},async()=>{
    while(next<queries.length) {
      const i=next++, query=queries[i]
      try {
        const response=await search(query,signal)
        if(!response.ok) throw Error('upstream')
        const data=await response.json(), rows=data?.result?.cmsArticleWebOld
        if(!Array.isArray(rows)) throw Error('invalid response')
        results[i]={query,rows:rows.slice(0,20)}
      } catch { results[i]={query,error:'News service unavailable'} }
    }
  }))
  return reply({results})
}
