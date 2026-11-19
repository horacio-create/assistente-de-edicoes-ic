// Read-only inspection of PSD v1 layer records. Does not control Photoshop.
import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export function psdLayers(data){
 assert.equal(data.toString('ascii',0,4),'8BPS');assert.equal(data.readUInt16BE(4),1);
 let p=26;p+=4+data.readUInt32BE(p);p+=4+data.readUInt32BE(p);const section=data.readUInt32BE(p);p+=4;if(!section)throw Error('PSD sem camadas');const length=data.readUInt32BE(p);p+=4;if(!length)throw Error('PSD sem registros');const count=Math.abs(data.readInt16BE(p));p+=2;const layers=[];
 for(let i=0;i<count;i++){
  const top=data.readInt32BE(p),left=data.readInt32BE(p+4),bottom=data.readInt32BE(p+8),right=data.readInt32BE(p+12);p+=16;const channels=data.readUInt16BE(p);p+=2+channels*6;assert.equal(data.toString('ascii',p,p+4),'8BIM');p+=12;const size=data.readUInt32BE(p);p+=4;const end=p+size,mask=data.readUInt32BE(p);p+=4+mask;p+=4+data.readUInt32BE(p);const nameLength=data[p];let name=data.toString('latin1',p+1,p+1+nameLength);p+=Math.ceil((nameLength+1)/4)*4;const extra=data.subarray(p,end);
  const tag=key=>{const at=extra.indexOf(Buffer.from('8BIM'+key));if(at<0)return null;const n=extra.readUInt32BE(at+8);return extra.subarray(at+12,at+12+n);};
  const unicode=tag('luni');if(unicode){const n=unicode.readUInt32BE(0);name='';for(let j=0;j<n;j++)name+=String.fromCharCode(unicode.readUInt16BE(4+j*2));}
  const group=tag('lsct')||tag('lsdk');layers.push({name,top,left,bottom,right,mask:mask>0,text:!!tag('TySh'),smart:!!(tag('SoLd')||tag('SoLE')),group:group?.readUInt32BE(0)||0,extra});p=end;
 }
 return {width:data.readUInt32BE(18),height:data.readUInt32BE(14),layers};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const out=path.resolve('test-results/refinement-review'),jobs=JSON.parse(await readFile(path.join(out,'native-report.json'),'utf8')),reports=[];
assert.equal(jobs.length,3,'Conclua os três exemplos antes de auditar.');
for(let i=0;i<jobs.length;i++){
 const job=jobs[i],payload=JSON.parse(await readFile(path.join(out,`payload-${i}.json`),'utf8')),doc=psdLayers(await readFile(path.join(job.output,'cartelas.psd'))),spec=payload.manifest.cards;
 assert.equal(job.state,'complete');assert.equal(doc.width,1280);assert.equal(doc.height,720);const groups=doc.layers.filter(l=>[1,2].includes(l.group));assert.equal(groups.length,spec.length);assert.deepEqual(groups.map(l=>l.name).sort(),spec.map(c=>c.name).sort());
 const texts=spec.flatMap(c=>c.layers).filter(l=>l.type==='text'),photos=spec.flatMap(c=>c.layers).filter(l=>l.type==='photo');assert.equal(doc.layers.filter(l=>l.text).length,texts.length);assert.equal(doc.layers.filter(l=>l.smart&&l.mask).length,photos.length);
 for(const item of texts){const expected=Buffer.from(item.lines.join('\r')+'\0','utf16le');expected.swap16();assert.ok(doc.layers.some(l=>l.text&&l.name===item.name&&l.extra.includes(expected)),`Texto divergente: ${item.name}`);}
 reports.push({job:job.id,groups:groups.length,nativeTexts:texts.length,smartPhotosWithMask:photos.length,width:doc.width,height:doc.height});
}
await writeFile(path.join(out,'psd-audit.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}
