const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('static/video-batch.js','utf8');
function setup(existing=[]){
 const controls={},meta={timelines:[{id:'first',name:'Timeline',composition:{clips:[]}}],activeTimeline:'first'};meta.composition=meta.timelines[0].composition;
 const context={job:{media:existing,meta},TIMELINE_LIMIT:50,resolveVideoImport:null,structuredClone,Set,
  $:id=>controls[id]??=( {} ),videoImportChoice:{querySelector:s=>controls[s]??=({}),showModal(){context.opened=true;}},
  project:()=>meta.composition,timelines:()=>meta.timelines,ensureProject(){},mutateEdition:fn=>fn(),freshId:()=>String(meta.timelines.length),emptyComposition:()=>({clips:[]}),activeTimeline:()=>meta.timelines.find(t=>t.id===meta.activeTimeline),nextTimelineName:()=> 'Timeline',projectDuration:()=>Math.max(0,...meta.composition.clips.map(c=>c.at+c.duration)),trackForMedia:()=>({id:'track'}),defaultClip:(m,t,at)=>({id:m.id,at,duration:m.kind==='image'?15:4}),timelineLimitMessage:'Limite'};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function chooseVideoTimelineMode'),source.indexOf('// Refresh an already queued')),context);return context;
}
test('imagens, vídeos e lotes mistos recebem a escolha; áudio isolado não',async()=>{
 for(const names of [['a.png','b.jpg'],['a.mp4','b.png'],['a.tiff','b.webp']]){const c=setup();const pending=c.chooseVideoTimelineMode(names.map(name=>({name})));assert.equal(c.opened,true);c.resolveVideoImport({mode:'separate',queue:false});assert.equal((await pending).mode,'separate');}
 const c=setup();assert.equal((await c.chooseVideoTimelineMode([{name:'a.wav'},{name:'b.mp3'}])).mode,'library');
 const d=setup([{kind:'image'}]);d.chooseVideoTimelineMode([{name:'b.png'}]);assert.equal(d.opened,true);
});
test('cada imagem ganha timeline própria, com duração e nome originais preservados',()=>{
 const c=setup();for(const [id,name] of [['a','Foto A.png'],['b','Foto B.jpg']])c.appendImportedVideo({id,name,kind:'image'},'separate');
 assert.equal(c.timelines().length,2);assert.deepEqual(Array.from(c.timelines(),t=>t.name),['Foto A','Foto B']);for(const t of c.timelines()){assert.equal(t.composition.clips.length,1);assert.equal(t.composition.clips[0].at,0);assert.equal(t.composition.clips[0].duration,15);}
});
test('timeline única organiza imagens e vídeo em sequência',()=>{
 const c=setup();for(const [id,kind] of [['a','image'],['b','video'],['c','image']])c.appendImportedVideo({id,name:id,kind},'single');
 assert.equal(c.timelines().length,1);assert.deepEqual(Array.from(c.project().clips,c=>c.at),[0,15,19]);
});
