import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {graphicColors} from '../public/graphic-colors.js';
import {recurringColors} from '../public/reference-analysis.js';
const names=['Captura de tela 2026-10-23 073713.png','Captura de tela 2026-10-23 073708.png','Captura de tela 2026-10-23 073720.png'];
const samples=[];
for(const name of names){const p=PNG.sync.read(await readFile('C:/Users/TM-Mídia/Pictures/Screenshots/'+name)),scale=Math.min(1,900/Math.max(p.width,p.height)),width=Math.max(1,Math.round(p.width*scale)),height=Math.max(1,Math.round(p.height*scale)),data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=(Math.min(p.height-1,Math.floor(y/scale))*p.width+Math.min(p.width-1,Math.floor(x/scale)))*4;data.set(p.data.subarray(src,src+4),(y*width+x)*4);}samples.push({name,colors:graphicColors({width,height,data})});}
await mkdir('test-results/graphic-colors',{recursive:true});await writeFile('test-results/graphic-colors/analysis.json',JSON.stringify({samples,combined:recurringColors(samples)},null,2));console.log(JSON.stringify(samples.map(s=>({name:s.name,colors:s.colors.map(c=>[c.hex,Math.round(c.graphicScore),c.regions,c.rectangles])})),null,2));
