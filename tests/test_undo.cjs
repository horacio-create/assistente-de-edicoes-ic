const test=require('node:test'),assert=require('node:assert/strict');
const EditHistory=require('../static/undo-history.js');
const entry=(id,zoom,x=0)=>[{id,settings:{zoom,x,mode:'contain'}}];
test('undo groups a drag and preserves redo without aliasing settings',()=>{const h=new EditHistory();const a=entry('a',1),b=entry('a',1,.2),c=entry('a',1,.6);h.record(a,b,'drag-1');h.record(b,c,'drag-1');c[0].settings.x=.9;assert.deepEqual(h.undo(),a);assert.deepEqual(h.redo(),entry('a',1,.6));});
test('undo batch restores all affected images; new edit discards redo',()=>{const h=new EditHistory(),a=[...entry('a',1),...entry('b',2)],b=[...entry('a',3),...entry('b',3)];h.record(a,b);assert.deepEqual(h.undo(),a);h.record(a,[...entry('a',4),...entry('b',2)]);assert.equal(h.redo(),null);});
test('separate gestures remain separate even on the same slider',()=>{const h=new EditHistory();h.record(entry('a',1),entry('a',2),'first');h.record(entry('a',2),entry('a',3),'second');assert.deepEqual(h.undo(),entry('a',2));assert.deepEqual(h.undo(),entry('a',1));assert.equal(h.undo(),null);});
test('no-op edits do not consume history and session reset clears both stacks',()=>{const h=new EditHistory(2);assert.equal(h.record(entry('a',1),entry('a',1)),false);for(let n=1;n<=3;n++)h.record(entry('a',n),entry('a',n+1));assert.deepEqual(h.undo(),entry('a',3));assert.deepEqual(h.undo(),entry('a',2));assert.equal(h.undo(),null);h.clear();assert.equal(h.redo(),null);});

test('portable close warns even with saved media and preserves normal web behavior', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
  const handler = source.match(/window\.onbeforeunload=e=>\{(.+?)\};/)[1];
  const run = (portable, media, dirty=false, busy=false) => {
    let prevented = false;
    vm.runInNewContext(handler, {info:{portable},job:{media},dirty,busy,e:{preventDefault(){prevented=true;}}});
    return prevented;
  };
  assert.equal(run(true, [{}]), true);
  assert.equal(run(true, []), false);
  assert.equal(run(false, [{}]), false);
  assert.equal(run(false, [], true), true);
  assert.equal(run(false, [], false, true), true);
});
