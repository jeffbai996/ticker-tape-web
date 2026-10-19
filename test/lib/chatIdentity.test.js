// @vitest-environment node
import {expect,it} from 'vitest'
import {assistantIdentityPrompt} from '../../src/lib/chatIdentity.js'
it('leads with the product identity and asks for a short capability introduction',()=>{
 const prompt=assistantIdentityPrompt({modelLabel:'Sonnet 5.5',effort:'medium'})
 expect(prompt).toContain('ticker-tape AI assistant')
 expect(prompt).toContain('brief introduction')
 expect(prompt).toContain('portfolios')
 expect(prompt).toContain('watchlists')
 expect(prompt).toContain('not your identity')
})
it('states the selected model accurately when the user specifically asks about it',()=>{
 const prompt=assistantIdentityPrompt({modelLabel:'Sonnet 5.5',effort:'medium'})
 expect(prompt).toContain('Claude Sonnet 5.5')
 expect(prompt).toContain('medium')
 expect(prompt).toContain('specifically asks about the underlying model')
})
it('does not invent a model when registry metadata is unavailable',()=>{
 const prompt=assistantIdentityPrompt()
 expect(prompt).toContain('do not guess')
 expect(prompt).not.toContain('Sonnet')
})
