import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestPalette,identityCandidates} from '../public/identity-suggest.js';

test('cor de marca do site vira Principal, fundo claro vira Fundo',()=>{
  const p=suggestPalette({siteColors:[{color:'#ffffff',reason:'Usada no visual do site'},{color:'#cc3366',reason:'Cor do tema do site'},{color:'#333366',reason:'Usada no visual do site'}],feedColors:[{hex:'#fdfefe'},{hex:'#162e5a'}]});
  assert.equal(p.primary,'#cc3366');assert.equal(p.background,'#fdfefe');assert.equal(p.accent,'#162e5a');
  assert.deepEqual(p.sources.primary,['site']);
});

test('somente feed: cor saturada é Principal e outra cor distinta é Destaque',()=>{
  const p=suggestPalette({feedColors:[{hex:'#f8f4ed'},{hex:'#996c61'},{hex:'#9a6d62'},{hex:'#2b6cb0'}]});
  assert.equal(p.background,'#f8f4ed');assert.equal(p.primary,'#996c61');assert.equal(p.accent,'#2b6cb0');
});

test('cores parecidas se juntam e sem cores não há proposta',()=>{
  assert.equal(identityCandidates({feedColors:[{hex:'#996c61'},{hex:'#9a6d62'}]}).length,1);
  assert.equal(suggestPalette({}),null);
  const mono=suggestPalette({feedColors:[{hex:'#ffffff'},{hex:'#1a1a1a'}]});
  assert.equal(mono.primary,'#1a1a1a');assert.equal(mono.background,'#ffffff');assert.match(mono.accent,/^#[0-9a-f]{6}$/);
});
