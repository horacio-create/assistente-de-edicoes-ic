import {connectFileDrop} from './imports.js';
import {normalizeHex,pixelPosition} from './palette.js';
import {dominantColors} from './palette-analysis.js';

export function setupPalettePicker({getProject=()=>null}={}){
  const $=id=>document.getElementById(id),dialog=$('palette-dialog'),canvas=$('palette-canvas');
  let targets=null,hasImage=false,colors=[];
  const applyWork=document.createElement('button');applyWork.id='palette-apply-work';applyWork.className='button primary';applyWork.textContent='Aplicar cores ao VT';dialog.querySelector('.properties-actions').after(applyWork);applyWork.onclick=()=>{$('apply-colors').click();dialog.close();};
  const setColor=hex=>{$('palette-hex').value=hex;$('palette-sample').style.background=hex;};
  function swatches(){
    $('palette-swatches').replaceChildren();
    for(const hex of colors){const button=document.createElement('button');button.type='button';button.className='palette-swatch';button.style.background=hex;button.title=hex;button.setAttribute('aria-label','Escolher '+hex);button.onclick=()=>setColor(hex);$('palette-swatches').append(button);}
  }
  function analyze(){
    const sample=document.createElement('canvas'),ratio=Math.min(1,256/Math.max(canvas.width,canvas.height));
    sample.width=Math.max(1,Math.round(canvas.width*ratio));sample.height=Math.max(1,Math.round(canvas.height*ratio));
    const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,sample.width,sample.height);
    const found=dominantColors(ctx.getImageData(0,0,sample.width,sample.height));
    $('palette-detected').replaceChildren();$('palette-analysis').hidden=false;
    $('palette-analysis-note').textContent=found.length?'Cores aproximadas da área opaca. Escolha uma e indique onde usar. Códigos oficiais têm prioridade.':'Não encontrei áreas opacas suficientes. Use outra imagem ou digite o código da cor.';
    for(const {hex,share} of found){
      const button=document.createElement('button');button.type='button';button.className='detected-color';button.dataset.detectedColor=hex;
      const chip=document.createElement('span');chip.className='detected-color-chip';chip.style.background=hex;chip.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=hex.toUpperCase();
      const amount=document.createElement('small');amount.textContent=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(share);
      button.append(chip,label,amount);button.setAttribute('aria-label',`Escolher cor encontrada ${hex.toUpperCase()}`);
      button.onclick=()=>{setColor(hex);$('palette-feedback').textContent='Cor selecionada. Escolha principal, destaque ou fundo para usar.';};
      $('palette-detected').append(button);
    }
  }
  async function showImage(source,name){
    const bitmap=await createImageBitmap(source);
    try{
      if(bitmap.width*bitmap.height>32000000)throw new Error('Use uma imagem de até 32 megapixels.');
      const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
      hasImage=true;canvas.hidden=false;$('palette-image-name').textContent=name;colors=[];swatches();analyze();
    }finally{bitmap.close();}
  }
  const workLogo=()=>{const p=getProject();return p?.assets[p.clientIdentity?.logoAssetId]||Object.values(p?.assets||{}).find(a=>a.kind==='logo');};
  for(const [button,fields] of [['pick-work-colors',{primary:'primary-color',accent:'accent-color',background:'background-color'}],['pick-client-colors',{primary:'client-primary',accent:'client-accent',background:'client-background'}]]){
    $(button).onclick=()=>{targets=fields;applyWork.hidden=button!=='pick-work-colors';$('palette-use-logo').hidden=button!=='pick-work-colors'||!workLogo();$('palette-feedback').textContent='Importe uma imagem para encontrar suas cores ou digite o código informado na identidade.';dialog.showModal();};
  }
  $('palette-use-logo').onclick=async()=>{
    const button=$('palette-use-logo');button.disabled=true;
    try{const asset=workLogo();if(!asset)throw new Error('Adicione o logo do cliente nos materiais.');const bytes=Uint8Array.from(atob(asset.data.split(',')[1]),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:asset.data.slice(5,asset.data.indexOf(';'))});await showImage(blob,asset.name);$('palette-feedback').textContent='Cores encontradas no logo. Revise antes de usar na identidade.';}
    catch(err){$('palette-feedback').textContent=err.message;}finally{button.disabled=false;}
  };
  $('palette-close').onclick=()=>dialog.close();
  $('palette-hex').oninput=()=>{try{$('palette-sample').style.background=normalizeHex($('palette-hex').value);}catch{}};
  canvas.onclick=e=>{
    if(!hasImage)return;const p=pixelPosition(e.clientX,e.clientY,canvas.getBoundingClientRect(),canvas.width,canvas.height),rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(p.x,p.y,1,1).data;
    if(rgba[3]<255){$('palette-feedback').textContent='Este ponto tem transparência. Escolha uma área opaca ou digite o código da cor.';return;}
    const hex='#'+Array.from(rgba.slice(0,3),v=>v.toString(16).padStart(2,'0')).join('');setColor(hex);
    if(!colors.includes(hex)){colors=[...colors.slice(-19),hex];swatches();}
    $('palette-feedback').textContent='Cor capturada. Em imagens JPG ela pode variar; prefira o código escrito na prancha quando disponível.';
  };
  for(const button of dialog.querySelectorAll('[data-palette-role]'))button.onclick=()=>{
    try{const hex=normalizeHex($('palette-hex').value);setColor(hex);const input=$(targets[button.dataset.paletteRole]);input.value=hex;input.dispatchEvent(new Event('change',{bubbles:true}));$('palette-feedback').textContent=`${button.textContent}: ${hex.toUpperCase()}. Ao fechar, aplique as cores no trabalho ou salve o perfil do cliente.`;}catch(err){$('palette-feedback').textContent=err.message;}
  };
  connectFileDrop($('palette-file'),$('palette-drop'),async file=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('Use PNG, JPG ou WebP de até 8 MB.');
    await showImage(file,file.name);
    return 'Cores encontradas. Escolha uma sugestão ou clique na imagem para capturar.';
  });
  setColor('#c9a86a');
}
