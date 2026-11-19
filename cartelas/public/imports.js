// Uma única entrada para clique, teclado e arrastar/soltar.
export function connectFileDrop(input,zone,receive,{multiple=false}={}) {
  const status=zone.querySelector('.drop-status');let depth=0,working=false;
  const isFileDrag=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  async function accept(files) {
    if(working)return;
    zone.classList.remove('drop-over','drop-error');depth=0;
    if(!files.length||(!multiple&&files.length!==1)) {status.textContent='Envie um arquivo por vez neste campo.';zone.classList.add('drop-error');return;}
    working=true;zone.classList.add('drop-busy');zone.setAttribute('aria-busy','true');status.textContent='Importando…';
    try {const message=await receive(multiple?files:files[0]);status.textContent=message||'Arquivo importado.';}
    catch(err) {status.textContent=err.message||'Não foi possível importar.';zone.classList.add('drop-error');}
    finally {working=false;input.value='';zone.classList.remove('drop-busy');zone.setAttribute('aria-busy','false');}
  }
  input.addEventListener('change',()=>{if(input.files.length)accept(Array.from(input.files));});
  zone.addEventListener('keydown',e=>{if(e.target===zone&&['Enter',' '].includes(e.key)){e.preventDefault();if(!working)input.click();}});
  zone.addEventListener('dragenter',e=>{if(!isFileDrag(e))return;e.preventDefault();depth++;zone.classList.add('drop-over');});
  zone.addEventListener('dragover',e=>{if(!isFileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect=working?'none':'copy';});
  zone.addEventListener('dragleave',e=>{if(!isFileDrag(e))return;e.preventDefault();if(--depth<=0){depth=0;zone.classList.remove('drop-over');}});
  zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('drop-over');depth=0;accept(Array.from(e.dataTransfer?.files||[]));});
}
export function preventFileNavigation() {
  const prevent=e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();};
  document.addEventListener('dragover',prevent);document.addEventListener('drop',prevent);
}
