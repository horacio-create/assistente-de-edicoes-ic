import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {photoshopScript} from '../public/export.js';
const base=new URL('../test-results/photoshop-native/',import.meta.url);
await mkdir(base,{recursive:true});
const manifest=JSON.parse(await readFile(new URL('composicao.json',base),'utf8'));
await writeFile(new URL('montar-cartelas.jsx',base),photoshopScript(manifest,{interactive:false,renderPreviews:true}),'utf8');
