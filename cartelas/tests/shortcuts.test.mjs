import test from 'node:test';import assert from 'node:assert/strict';
import {historyShortcut} from '../public/shortcuts.js';
test('atalhos de histórico aceitam Ctrl/Command Z e Shift para refazer',()=>{
  assert.equal(historyShortcut({key:'z',ctrlKey:true}),'undo');
  assert.equal(historyShortcut({key:'Z',ctrlKey:true,shiftKey:true}),'redo');
  assert.equal(historyShortcut({key:'z',metaKey:true}),'undo');
  assert.equal(historyShortcut({key:'Z',metaKey:true,shiftKey:true}),'redo');
  for(const event of [{key:'z'},{key:'a',ctrlKey:true},{key:'z',ctrlKey:true,altKey:true},{key:'z',ctrlKey:true,isComposing:true},{key:'z',ctrlKey:true,defaultPrevented:true}])assert.equal(historyShortcut(event),null);
});
test('histórico da arte não captura o desfazer nativo em campos editáveis',()=>{
  for(const target of [{isContentEditable:true},{closest:()=>({tagName:'TEXTAREA'})},{closest:()=>({tagName:'INPUT'})},{closest:()=>({tagName:'SELECT'})}]){
    assert.equal(historyShortcut({key:'z',ctrlKey:true,target}),null);
    assert.equal(historyShortcut({key:'Z',ctrlKey:true,shiftKey:true,target}),null);
  }
  assert.equal(historyShortcut({key:'z',ctrlKey:true,target:{closest:()=>null}}),'undo');
});
