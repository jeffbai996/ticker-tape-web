import {beforeEach,expect,it} from 'vitest'
import {addMemory,loadMemories,applyMemoryOperations,undoMemoryCompaction,applyMemoryTags} from '../../src/lib/chatMemory.js'
beforeEach(()=>localStorage.clear())
it('compacts with retained identifiers and can undo the exact facts',()=>{
 addMemory('Concise summaries.');addMemory('Keep summaries concise.');addMemory('Use USD.');addMemory('Check sources.')
 const before=loadMemories()
 expect(applyMemoryOperations([{op:'edit',id:1,text:'Keep summaries concise.'},{op:'delete',id:2}],{compact:true,expected:before})).toBe(2)
 expect(loadMemories().map(m=>m.id)).toEqual([1,3,4])
 undoMemoryCompaction()
 expect(loadMemories().map(m=>m.text).sort()).toEqual(before.map(m=>m.text).sort())
})
it('rejects invalid compaction before mutating or clearing memories',()=>{
 for(const text of ['First fact.','Second fact.','Third fact.'])addMemory(text)
 const before=loadMemories()
 expect(()=>applyMemoryOperations([{op:'delete',id:1},{op:'delete',id:2},{op:'delete',id:3}],{compact:true})).toThrow()
 expect(()=>applyMemoryOperations([{op:'edit',id:99,text:'Unknown'}],{compact:true})).toThrow()
 expect(loadMemories()).toEqual(before)
})
it('does not overwrite a memory changed while the model was working',()=>{
 addMemory('First fact.');const before=loadMemories();addMemory('Second fact.')
 expect(()=>applyMemoryOperations([{op:'edit',id:1,text:'Changed'}],{expected:before})).toThrow()
 expect(loadMemories()[0].text).toBe('First fact.')
})

it('strips temporary memory tags without adding, editing or deleting saved facts',()=>{
 addMemory('Existing fact')
 const before=loadMemories()
 expect(applyMemoryTags('Answer [MEMORY: Private fact] [MEMORY_EDIT: 1 | Changed] [MEMORY_DELETE: 1]',{persist:false})).toEqual({text:'Answer',notes:[]})
 expect(loadMemories()).toEqual(before)
 applyMemoryTags('[MEMORY: Normal fact]')
 expect(loadMemories().map(m=>m.text)).toEqual(['Existing fact','Normal fact'])
})
