import {profileFromTab,localTarget,addCapture,cropBox,autoScreens} from './model.js';
import {pagePrepare,pageMeasure,pageReset} from './page-scripts.js';
const $=id=>document.getElementById(id);let batch={batchId:crypto.randomUUID(),profile:'',captures:[]},connection=null,busy=false;
async function saveBatch(next){await chrome.storage.session.set({batch:next});batch=next;render();}
function target(){return localTarget($('port').value);}
function render(){
  $('captures').replaceChildren();$('batch-info').textContent=batch.captures.length?new URL(batch.profile).pathname.replaceAll('/','@').replace(/@$/,'')+' · '+batch.captures.length+' captura(s)':'Nenhuma captura ainda.';
  for(const [i,c] of batch.captures.entries()){const article=document.createElement('article'),image=document.createElement('img'),row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');article.className='shot';image.src=c.data;image.alt='Captura '+(i+1);row.className='heading';name.textContent='Tela '+(i+1);remove.textContent='Remover';remove.setAttribute('aria-label','Remover captura '+(i+1));remove.disabled=busy;remove.onclick=()=>run(async()=>{await saveBatch({...batch,batchId:crypto.randomUUID(),captures:batch.captures.filter(v=>v.id!==c.id)});},'capture-status');row.append(name,remove);article.append(image,row);$('captures').append(article);}
  $('capture').disabled=busy;$('auto').disabled=busy;$('auto-count').disabled=busy;$('clear').disabled=busy||!batch.captures.length;$('send').disabled=busy||!batch.captures.length||!connection;$('pair').disabled=busy;$('port').disabled=busy;$('disconnect').disabled=busy;$('open').disabled=busy;$('pair-fields').hidden=!!connection;$('disconnect').hidden=!connection;$('connection').textContent=connection?'Conectada ao Cartelas na porta '+connection.port+'.':'Conecte uma vez usando o código gerado no sistema.';
}
async function run(fn,status){if(busy)return;busy=true;render();try{await fn();}catch(e){$(status).textContent=e.message||'Não foi possível concluir.';}finally{busy=false;render();}}
async function compact(data){const image=new Image();image.src=data;await image.decode();if(!image.width||!image.height||image.width*image.height>40000000)throw Error('A tela é grande demais. Reduza a janela do navegador.');let side=1400;while(side>=650){const scale=Math.min(1,side/Math.max(image.width,image.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);const result=c.toDataURL('image/png');if(result.length<=2500000)return result;side=Math.floor(side*.8);}throw Error('A captura ficou muito grande. Reduza a janela e tente novamente.');}
async function request(route,body,authorization){let response;try{response=await fetch(target()+route,{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:'Bearer '+authorization}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw Error('Não consegui falar com o Cartelas. Abra o sistema, confira a porta e autorize o acesso local se o navegador pedir.');}let result;try{result=await response.json();}catch{throw Error('Este endereço não respondeu como Cartelas. Confira a porta e reinicie o sistema atualizado.');}if(!response.ok){if(response.status===401&&authorization){await chrome.storage.local.remove('connection');connection=null;}throw Error(result.error||'Não foi possível enviar.');}return result;}
$('capture').onclick=()=>run(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true}),profile=profileFromTab(tab);if(batch.captures.length&&batch.profile!==profile)throw Error('O lote pertence a outro cliente. Envie ou limpe o lote primeiro.');const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'}),[after]=await chrome.tabs.query({active:true,currentWindow:true});if(after?.id!==tab.id||profileFromTab(after)!==profile)throw Error('A aba mudou durante a captura. Tente novamente no perfil correto.');const next=addCapture(batch,{id:crypto.randomUUID(),profile,data:await compact(data),createdAt:new Date().toISOString()});await saveBatch(next);$('send-status').textContent='';$('capture-status').textContent='Captura guardada. Pode fechar a extensão, rolar o feed e abri-la novamente.';},'capture-status');
$('clear').onclick=()=>run(async()=>{await saveBatch({batchId:crypto.randomUUID(),profile:'',captures:[]});$('capture-status').textContent='Lote limpo.';},'capture-status');
$('pair').onclick=()=>run(async()=>{const port=new URL(target()).port||'80',value=await request('/api/capture/pair',{code:$('code').value.trim()});if(typeof value.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.token))throw Error('Resposta de conexão inválida.');const next={token:value.token,port,deviceId:value.deviceId};await chrome.storage.local.set({connection:next});connection=next;$('code').value='';$('send-status').textContent='Extensão conectada. Você já pode enviar o lote.';},'send-status');
async function sendBatch(){if(!connection)return;if(String(connection.port)!==String($('port').value))throw Error('A porta mudou. Conecte a extensão ao sistema nessa porta.');const result=await request('/api/capture/receive',batch,connection.token);if(result.received!==true)throw Error('O Cartelas não confirmou o recebimento. O lote foi mantido para tentar novamente.');await saveBatch({batchId:crypto.randomUUID(),profile:'',captures:[]});$('send-status').textContent='Lote recebido! No Cartelas, abra Clientes → Capturas do navegador e escolha o cadastro de destino.';}
$('send').onclick=()=>run(async()=>{await sendBatch();$('capture-status').textContent='';},'send-status');
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function inTab(tabId,func,args=[]){const [entry]=await chrome.scripting.executeScript({target:{tabId},func,args});if(!entry||entry.result===undefined)throw Error('Não consegui ler a página do Instagram. Recarregue o perfil e tente de novo.');return entry.result;}
async function cropped(data,view){const image=new Image();image.src=data;await image.decode();const box=cropBox(view.rect,view.viewport,{width:image.width,height:image.height}),c=document.createElement('canvas');c.width=box.width;c.height=box.height;c.getContext('2d').drawImage(image,box.x,box.y,box.width,box.height,0,0,box.width,box.height);return c.toDataURL('image/png');}
// Automatic capture: starts only from the user's click on the open profile tab (activeTab), scrolls a few screens, never navigates or opens posts.
$('auto').onclick=()=>run(async()=>{
  const status=$('capture-status'),[tab]=await chrome.tabs.query({active:true,currentWindow:true}),profile=profileFromTab(tab),screens=autoScreens($('auto-count').value);
  if(batch.captures.length&&batch.profile!==profile)throw Error('O lote pertence a outro cliente. Envie ou limpe o lote primeiro.');
  if(batch.captures.length+screens>12)throw Error('O lote não tem espaço para '+screens+' telas. Envie ou limpe o lote primeiro.');
  const start=await inTab(tab.id,pagePrepare);
  if(start.login)throw Error('O Instagram pediu login. Entre na sua conta nesta aba e tente de novo.');
  if(start.isPrivate)throw Error('Este perfil é privado. Só é possível capturar perfis que você consegue ver.');
  let next=batch,taken=0,last=0,stop='';
  for(let i=0;i<screens;i++){
    status.textContent='Capturando tela '+(i+1)+' de '+screens+'… não mexa na aba.';
    const view=await inTab(tab.id,pageMeasure,[i===0]);
    if(view.login){stop=' O Instagram pediu login e a captura parou.';break;}
    await sleep(Math.max(0,700-(Date.now()-last)));
    const shot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});last=Date.now();
    const [after]=await chrome.tabs.query({active:true,currentWindow:true});
    if(after?.id!==tab.id||profileFromTab(after)!==profile){stop=' A aba mudou e a captura parou.';break;}
    try{next=addCapture(next,{id:crypto.randomUUID(),profile,data:await compact(await cropped(shot,view)),createdAt:new Date().toISOString(),kind:view.kind,...(view.kind==='grid'?{rows:view.rows,columns:view.columns}:{})});}
    catch(error){if(/já está no lote/.test(error.message)){stop=' O feed não avançou mais.';break;}throw error;}
    taken++;await saveBatch(next);
    if(view.atEnd){stop=' Chegou ao fim do feed.';break;}
  }
  await inTab(tab.id,pageReset).catch(()=>{});
  if(!taken)throw Error('Nenhuma tela capturada.'+stop);
  status.textContent=taken+' tela(s) capturada(s).'+stop;
  if($('auto-send').checked&&connection){await sendBatch();status.textContent+=' Lote enviado ao Cartelas.';}
  else if($('auto-send').checked)status.textContent+=' Conecte a extensão abaixo para enviar.';
},'capture-status');
$('port').onchange=()=>run(async()=>{const port=new URL(target()).port;await chrome.storage.local.set({port});$('send-status').textContent=connection&&connection.port!==port?'Esta porta precisa de um novo código de conexão.':'';},'send-status');
$('disconnect').onclick=()=>run(async()=>{await chrome.storage.local.remove('connection');connection=null;$('send-status').textContent='Conexão removida desta extensão. Você também pode revogá-la no Cartelas.';},'send-status');
$('open').onclick=()=>run(async()=>{const origin=target(),all=await chrome.tabs.query({url:'http://127.0.0.1/*'}),tabs=all.filter(tab=>{try{return new URL(tab.url).origin===origin;}catch{return false;}});if(tabs.length){await chrome.tabs.update(tabs[0].id,{active:true});if(chrome.windows?.update)await chrome.windows.update(tabs[0].windowId,{focused:true});}else await chrome.tabs.create({url:origin+'/'});},'send-status');
try{const stored=await chrome.storage.session.get('batch'),local=await chrome.storage.local.get(['connection','port','autoCount','autoSend']);if(stored.batch?.captures)batch=stored.batch;connection=local.connection||null;$('port').value=local.port||connection?.port||3210;if(local.autoCount)$('auto-count').value=local.autoCount;if(typeof local.autoSend==='boolean')$('auto-send').checked=local.autoSend;render();}catch{$('capture-status').textContent='Não foi possível abrir o armazenamento da extensão. Reabra pelo ícone do Chrome.';}
$('auto-count').onchange=()=>chrome.storage.local.set({autoCount:$('auto-count').value});
$('auto-send').onchange=()=>chrome.storage.local.set({autoSend:$('auto-send').checked});
