// Explicit maintenance task, never needed at runtime. Fetch only the pinned subset.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const commit='a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d';
const names={whatsapp:'brand-whatsapp',camera:'brand-instagram',graduation:'school',palette:'palette',ball:'ball-basketball',music:'music',robot:'robot',truck:'truck',face:'mood-smile',syringe:'vaccine',molecule:'atom',sparkle:'sparkles',heart:'heart',check:'check',phone:'phone',location:'map-pin',calendar:'calendar-event',chat:'message-circle',book:'book',food:'tools-kitchen-2',bag:'shopping-bag',star:'star',briefcase:'briefcase',tooth:'dental'};
const base=`https://raw.githubusercontent.com/tabler/tabler-icons/${commit}/`,directory='public/vendor/tabler';
Object.assign(names,{bowl:'soup',meat:'meat',cake:'cake',coffee:'coffee'});
await mkdir(directory,{recursive:true});
async function get(file,optional=false){const parts=file.match(/^icons\/(outline|filled)\/(.+)\.svg$/),cached=parts?`${directory}/${parts[2]}-${parts[1]}.svg`:file==='LICENSE'?`${directory}/LICENSE`:null;if(cached){try{return await readFile(cached,'utf8');}catch{}}const r=await fetch(base+file,{signal:AbortSignal.timeout(25000)});if(optional&&r.status===404)return null;if(!r.ok)throw new Error(`${file}: ${r.status}`);return r.text();}
const data={};
// Source SVGs are retained for license/provenance and visual inspection.
for(const [id,name] of Object.entries(names)){
 const record={name};
 for(const kind of ['outline','filled']){
  const svg=await get(`icons/${kind}/${name}.svg`,kind==='filled');if(!svg)continue;
  await writeFile(`${directory}/${name}-${kind}.svg`,svg);
  const paths=[...svg.matchAll(/<path\b([^>]*)\/?\s*>/g)].filter(m=>!/(?:stroke|fill)="none"/.test(m[1])).map(m=>m[1].match(/\bd="([^"]+)"/)?.[1]).filter(Boolean);
  if(!paths.length||/<(?:circle|rect|line|polygon|polyline|ellipse)\b/.test(svg))throw new Error(`Unsupported SVG geometry: ${name}`);
  record[kind]=paths;if(kind==='filled')record.fillRule=/fill-rule="evenodd"/.test(svg)?'evenodd':'nonzero';
 }
 data[id]=record;
}
await writeFile(`${directory}/LICENSE`,await get('LICENSE'));
await writeFile(`${directory}/SOURCE.json`,JSON.stringify({repository:'https://github.com/tabler/tabler-icons',commit,names},null,2));
await writeFile(`${directory}/catalog.js`,`// Tabler Icons, MIT license. Pinned source and license are alongside this file.\nexport const TABLER_ICONS=${JSON.stringify(data,null,2)};\n`);
console.log(`Vendored ${Object.keys(data).length} icons, ${Object.values(data).filter(i=>i.filled).length} filled variants.`);
