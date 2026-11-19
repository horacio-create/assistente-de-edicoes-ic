import {connectFileDrop} from './imports.js';
import {fontChoices,importFont,mergeFonts,registerFonts} from './fonts.js';
export function setupFonts({getProject,change,syncInputs,notify}){
  const $=id=>document.getElementById(id);
  connectFileDrop($('font-file'),$('font-drop'),async files=>{
    const projectId=getProject().id,records=await Promise.all(files.map(importFont)),merged=mergeFonts(getProject().fonts||[],records);await registerFonts(merged);
    if(getProject().id!==projectId)throw new Error('O trabalho mudou. Importe a fonte no trabalho correto.');
    change(()=>getProject().fonts=merged,null);syncInputs();$('font').value=records[0].id;$('font').dispatchEvent(new Event('change'));return `${records.length} fonte(s) pronta(s). Escolha a fonte e aplique aos textos.`;
  },{multiple:true});
  $('apply-font').onclick=()=>{
    const p=getProject(),font=$('font').value;if(!fontChoices(p.fonts||[]).some(f=>f.id===font))return notify('Escolha uma fonte disponível.');
    change(()=>{p.palette={...p.palette,font};for(const card of p.cards){for(const layer of card.layers)if(layer.type==='text'&&($('font-all-texts').checked||layer.role==='title')){layer.font=font;if(font.startsWith('font-'))layer.weight='normal';}card.approved=false;}},null);notify('Fonte aplicada mantendo o layout. Confira quebras e pendências de tamanho de texto.');
  };
}
