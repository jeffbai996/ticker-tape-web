
import { reportProxyBatch as reportBatch, whenFirstBatch } from '../../src/lib/feed.js'

describe('whenFirstBatch — secondary lookups wait for the first prices', () => {
  it('settles true once a batch lands, and instantly thereafter', async () => {
    let settled = null
    const p = whenFirstBatch(50).then((v) => { settled = v })
    await new Promise((r) => setTimeout(r, 5))
    expect(settled).toBeNull()
    reportBatch(true)
    await p
    expect(settled).toBe(true)
    expect(await whenFirstBatch(1)).toBe(true)
  })
})
