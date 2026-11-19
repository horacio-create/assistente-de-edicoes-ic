import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {PNG} from 'pngjs';import {psdLayers} from './inspect-refinement-psd.mjs';
const out=path.resolve('test-results/segment-templates'),kit=path.resolve('Exemplos/Restaurante-Mangai-Teste/Templates-por-segmento');
const json=async name=>JSON.parse(await readFile(path.join(out,name),'utf8'));
const job=await json('native-status.json');assert.equal(job.state,'complete');
const payload=await json('payload.json'),spec=payload.manifest.cards,doc=psdLayers(await readFile(path.join(job.output,'cartelas.psd')));
assert.equal(doc.width,1280);assert.equal(doc.height,720);
const groups=doc.layers.filter(l=>[1,2].includes(l.group));assert.equal(groups.length,3);
assert.deepEqual(groups.map(l=>l.name).sort(),spec.map(c=>c.name).sort());
const text=spec.flatMap(c=>c.layers).filter(l=>l.type==='text'),photos=spec.flatMap(c=>c.layers).filter(l=>l.type==='photo');
assert.equal(doc.layers.filter(l=>l.text).length,text.length);assert.equal(doc.layers.filter(l=>l.smart&&l.mask).length,photos.length);
for(const item of text){const bytes=Buffer.from(item.lines.join('\r')+'\0','utf16le');bytes.swap16();assert.ok(doc.layers.some(l=>l.text&&l.name===item.name&&l.extra.includes(bytes)),item.name);}
const icons=spec[1].layers.filter(l=>l.name.startsWith('Ícone '));assert.equal(icons.length,3);for(const icon of icons)assert.ok(doc.layers.some(l=>l.name===icon.name),icon.name);
assert.ok(spec[1].layers.some(l=>l.type==='text'&&l.lines.join(' ')==='Nossos sabores'));
const comparisons=[];
for(let n=1;n<=3;n++){const filename=`cartela-${String(n).padStart(2,'0')}.png`,a=PNG.sync.read(await readFile(path.resolve('.exports',job.id,'previas',filename))),b=PNG.sync.read(await readFile(path.join(job.output,filename)));assert.equal(a.width,b.width);assert.equal(a.height,b.height);let difference=0;for(let i=0;i<a.data.length;i+=4)for(let k=0;k<3;k++)difference+=Math.abs(a.data[i+k]-b.data[i+k]);const mean=difference/(a.width*a.height*3);assert.ok(mean<3);comparisons.push({card:n,meanRgbDifference:Math.round(mean*10000)/10000});}
const audit={job:job.id,groups:groups.length,nativeTexts:text.length,smartPhotosWithMasks:photos.length,foodIcons:icons.map(l=>l.name),comparisons};await writeFile(path.join(out,'psd-audit.json'),JSON.stringify(audit,null,2));
await mkdir(kit,{recursive:true});for(const file of ['restaurant.cartelas.json','approval.png'])await copyFile(path.join(out,file),path.join(kit,file));await copyFile(path.join(job.output,'cartelas.psd'),path.join(kit,'Restaurante-refinado.psd'));
for(let n=1;n<=3;n++)await copyFile(path.join(job.output,`cartela-${String(n).padStart(2,'0')}.png`),path.join(kit,`cartela-${n}.png`));
console.log(JSON.stringify(audit,null,2));
