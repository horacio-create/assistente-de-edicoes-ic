'use strict';

let editorKind = 'image';
const editorSessions = new Map();
const videoPlayer = $('video-source');
const finalPlayer = $('final-video-source');
let videoFrameRequest = 0, finalFrameRequest = 0, finalVideoMedia = null;

function seconds(value) { return Number(value || 0).toFixed(2).replace('.', ',') + ' s'; }
let segmentMedia = null, selectedSegment = 0, finalSegment = 0, draggedSegment = null;
const segmentThumbs=new Map();let thumbnailQueue=Promise.resolve();
function segmentThumbnail(m,start){
  const key=m.id+':'+start;
  if(!segmentThumbs.has(key)){
    const task=thumbnailQueue.then(async()=>{
      const player=document.createElement('video');player.muted=true;player.preload='metadata';player.src='/video/'+m.id;
      try{
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('thumbnail timeout')),8000);player.onloadedmetadata=()=>{clearTimeout(timer);resolve();};player.onerror=()=>{clearTimeout(timer);reject(new Error('thumbnail unavailable'));};player.load();});
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('thumbnail seek timeout')),8000);player.onseeked=()=>{clearTimeout(timer);resolve();};player.currentTime=Math.min(m.duration-.01,start+.01);});
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.getContext('2d').drawImage(player,0,0,160,90);return canvas.toDataURL('image/jpeg',.7);
      }catch{return '/media/'+m.id;}finally{player.removeAttribute('src');player.load();}
    });
    segmentThumbs.set(key,task);thumbnailQueue=task.catch(()=>{});if(segmentThumbs.size>200)segmentThumbs.delete(segmentThumbs.keys().next().value);
  }
  return segmentThumbs.get(key);
}
function videoSegments(m) { return m.settings.segments || [{start:m.settings.trimStart,end:m.settings.trimEnd}]; }
function rawVideoLength(m) { return videoSegments(m).reduce((sum,p)=>sum+p.end-p.start,0); }
function segmentLength(m,p) { return Math.max(1,Math.round((p.end-p.start)/m.settings.speed*30))/30; }
function videoLength(m) { return videoSegments(m).reduce((sum,p)=>sum+segmentLength(m,p),0); }
function segmentNow(m,index,sourceTime) {
  const parts=videoSegments(m);
  return parts.slice(0,index).reduce((sum,p)=>sum+segmentLength(m,p),0)+Math.min(segmentLength(m,parts[index]),Math.max(0,(sourceTime-parts[index].start)/m.settings.speed));
}
function locateMontage(m,time) {
  const parts=videoSegments(m); let remaining=Math.max(0,time);
  for(let i=0;i<parts.length;i++) { const length=segmentLength(m,parts[i]);if(remaining<length||i===parts.length-1)return {index:i,time:Math.min(parts[i].end-.001,parts[i].start+remaining*m.settings.speed)};remaining-=length; }
}
function commitSegments(parts,index=selectedSegment) {
  const m=current();if(busy||m?.kind!=='video')return;
  videoPlayer.pause();undoGesture=null;selectedSegment=Math.max(0,Math.min(index,parts.length-1));
  change({segments:parts,trimStart:parts[0].start,trimEnd:parts[0].end});renderGrid();
}
function selectSegment(index,seek=true) {
  const m=current();if(m?.kind!=='video')return;
  selectedSegment=index;if(seek){videoPlayer.pause();videoPlayer.currentTime=videoSegments(m)[index].start;}
  syncVideo();
}
function moveSegment(from,to) {
  const m=current();if(busy||m?.kind!=='video'||to<0||to>=videoSegments(m).length||from===to)return;
  if(videoSegments(m).slice(Math.min(from,to),Math.max(from,to)+1).some(p=>p.locked)){toast('Desbloqueie o trecho pelo cadeado antes de mudar essa ordem.');return;}
  const parts=structuredClone(videoSegments(m)),[part]=parts.splice(from,1);parts.splice(to,0,part);
  commitSegments(parts,to);videoPlayer.currentTime=part.start;toast('Trechos encaixados, sem espaços.');
}
function renderMontage(m) {
  const parts=videoSegments(m),track=$('montage-track');track.replaceChildren();
  track.style.width=Math.max(100,parts.length*11)+'%';
  const ruler=document.createElement('div');ruler.className='montage-ruler';
  for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.className='montage-tick';tick.style.left=i*25+'%';tick.textContent=seconds(videoLength(m)*i/4);ruler.append(tick);}
  ruler.onclick=e=>{const rect=track.getBoundingClientRect();seekMontage(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*videoLength(m));};
  parts.forEach((part,index)=>{
    const block=document.createElement('button');block.type='button';block.className='montage-block'+(index===selectedSegment?' selected':'');
    block.draggable=!part.locked;block.classList.toggle('locked',!!part.locked);block.dataset.index=index;block.style.flexGrow=segmentLength(m,part);
    block.setAttribute('aria-pressed',String(index===selectedSegment));block.setAttribute('aria-label',`Trecho ${index+1}: de ${seconds(part.start)} a ${seconds(part.end)}`);
    const image=document.createElement('img');image.src='/media/'+m.id;image.alt='';image.draggable=false;segmentThumbnail(m,part.start).then(src=>image.src=src);
    const title=document.createElement('strong');title.textContent=`Trecho ${index+1}`;if(part.locked)title.insertAdjacentHTML('afterbegin',icon('lock','title-icon'));
    const range=document.createElement('span');range.textContent=`${seconds(part.start)} → ${seconds(part.end)}`;
    const duration=document.createElement('small');duration.textContent=seconds(segmentLength(m,part));
    block.append(image,title,range,duration);block.onclick=()=>selectSegment(index);
    block.ondragstart=e=>{if(busy||part.locked){e.preventDefault();return;}videoPlayer.pause();draggedSegment=index;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-indoor-segment',String(index));block.classList.add('dragging');};
    block.ondragover=e=>{if(draggedSegment===null)return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';track.querySelectorAll('.snap-before,.snap-after').forEach(el=>el.classList.remove('snap-before','snap-after'));const rect=block.getBoundingClientRect();block.classList.add(e.clientX<rect.x+rect.width/2?'snap-before':'snap-after');};
    block.ondrop=e=>{if(draggedSegment===null)return;e.preventDefault();e.stopPropagation();const rect=block.getBoundingClientRect();let to=index+(e.clientX>=rect.x+rect.width/2?1:0);if(draggedSegment<to)to--;const from=draggedSegment;draggedSegment=null;moveSegment(from,to);renderMontage(current());};
    block.ondragend=()=>{draggedSegment=null;track.querySelectorAll('.snap-before,.snap-after,.dragging').forEach(el=>el.classList.remove('snap-before','snap-after','dragging'));};track.append(block);
  });
  const head=document.createElement('div');head.id='montage-playhead';head.className='montage-playhead';head.tabIndex=0;head.setAttribute('role','slider');head.setAttribute('aria-label','Cursor de reprodução');head.setAttribute('aria-valuemin','0');head.setAttribute('aria-valuemax',videoLength(m));head.title='Arraste para escolher o ponto do corte';
  const grip=document.createElement('span');grip.className='playhead-grip';head.append(grip);
  let moving=false;
  head.onpointerdown=e=>{if(busy||e.button!==0)return;e.preventDefault();e.stopPropagation();moving=true;videoPlayer.pause();head.setPointerCapture(e.pointerId);head.focus();};
  head.onpointermove=e=>{if(!moving)return;const rect=track.getBoundingClientRect();seekMontage(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*videoLength(m),false);};
  head.onpointerup=head.onpointercancel=e=>{if(!moving)return;moving=false;if(head.hasPointerCapture(e.pointerId))head.releasePointerCapture(e.pointerId);syncVideo();$('montage-playhead')?.focus();};
  track.append(ruler,head);
  $('montage-summary').textContent=`${parts.length} trecho${parts.length===1?'':'s'} · ${seconds(videoLength(m))} no total`;
  $('montage-end').textContent=seconds(videoLength(m));$('montage-scrub').max=videoLength(m);
  $('selected-segment').textContent=`Ajustar trecho ${selectedSegment+1}`;
  const locked=!!parts[selectedSegment].locked,visible=m.settings.previewVisible!==false;
  $('remove-segment').disabled=parts.length===1||locked;$('add-segment').disabled=parts.length>=100;
  $('segment-left').disabled=selectedSegment===0||locked||!!parts[selectedSegment-1]?.locked;$('segment-right').disabled=selectedSegment===parts.length-1||locked||!!parts[selectedSegment+1]?.locked;
  for(const id of ['trim-start','trim-end','trim-start-handle','trim-end-handle'])$(id).disabled=locked;
  $('whole-video').disabled=parts.some(p=>p.locked);
  $('duration-final').disabled=$('normal-speed').disabled=parts.some(p=>p.locked);
  $('duration-final').title=parts.some(p=>p.locked)?'Desbloqueie os trechos antes de alterar a velocidade da montagem.':'';
  const lock=$('segment-lock');lock.innerHTML=propertyIcon('lock',locked)+`<span>${locked?'Desbloquear':'Bloquear'} <span class="shortcut-hint">L</span></span>`;lock.setAttribute('aria-pressed',String(locked));lock.setAttribute('aria-label',locked?'Desbloquear trecho selecionado':'Bloquear trecho selecionado');lock.title='Protege cortes, remoção e ordem do trecho selecionado (L)';
  const eye=$('track-visibility');eye.innerHTML=propertyIcon('eye',visible)+`<span>${visible?'Ocultar prévia':'Mostrar prévia'} <span class="shortcut-hint">E</span></span>`;eye.setAttribute('aria-pressed',String(visible));eye.setAttribute('aria-label',visible?'Ocultar prévia da faixa':'Mostrar prévia da faixa');eye.title='Exibe ou oculta apenas a prévia. A exportação mantém todos os trechos (E)';
  $('segment-lock-status').textContent=locked?'Trecho protegido pelo cadeado':'';
}
function propertyIcon(kind,on){return kind==='lock'?icon(on?'lock':'lock-open'):icon(on?'eye':'eye-off');}
function seekMontage(time,render=true){const m=current();if(m?.kind!=='video')return;videoPlayer.pause();const position=locateMontage(m,time);selectedSegment=position.index;videoPlayer.currentTime=position.time;if(render)syncVideo();else{for(const block of $('montage-track').querySelectorAll('.montage-block'))block.classList.toggle('selected',Number(block.dataset.index)===selectedSegment);syncTimeline();}}
function audioIcon(muted) {
  return icon(muted ? 'volume-x' : 'volume', 'line-icon audio-icon');
}
function videoSelection() { return job?.media.filter(m => m.kind === 'video' && selected.has(m.id)) || []; }

function syncEditorKind() {
  const video = editorKind === 'video';
  document.body.classList.toggle('video-editor', video);
  $('files').accept = video ? '.mp4,.mov,.m4v,.mkv,.avi,.webm,.wmv,.mpg,.mpeg' : '.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pdf';
  $('empty').setAttribute('aria-label', video ? 'Adicionar vídeos' : 'Adicionar imagens');
  $('empty').querySelector('.step-label').textContent = video ? 'Adicionar vídeos' : 'Adicionar imagens';
  $('empty').querySelector('h2').textContent = video ? 'Traga seu primeiro vídeo.' : 'Traga sua primeira arte.';
  $('empty').querySelector('p:not(.help)').textContent = video ? 'Arraste vídeos para esta área ou clique para escolher.' : 'Arraste imagens para esta área ou clique para escolher.';
  $('add-files').textContent = video ? 'Escolher vídeos' : 'Escolher imagens';
  const formats = video ? 'MP4, MOV, MKV, AVI, WebM e outros vídeos' : 'JPG, PNG, WebP, BMP, TIFF e PDF';
  $('empty').querySelector('.help').textContent = formats + ' · até 100 MB por arquivo';
  $('editor').querySelector('.step-label').textContent = video ? 'Ajustar vídeo' : 'Ajustar imagem';
  $('filmstrip').querySelector('.step-label').textContent = video ? 'Vídeos adicionados' : 'Imagens adicionadas';
  $('filmstrip').querySelector('.section-title p').textContent = `Arraste mais ${video ? 'vídeos' : 'imagens'} aqui ou use o botão +. ${formats} · até 100 MB por arquivo.`;
  $('format').replaceChildren();
  for (const [value, label] of video ? [['mp4', 'MP4 · compatível com as telas']] : [['jpg', 'JPG · alta qualidade'], ['png', 'PNG · sem perdas']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; $('format').append(option);
  }
  $('format').value = video ? 'mp4' : job?.meta?.format || 'jpg';
  document.querySelector('.export-bar > div > span:last-child').textContent = video ? 'MP4 · confira o áudio antes de exportar' : 'JPG de alta qualidade ou PNG · processamento local';
  syncVideo();
}

async function switchEditor(kind, view = 'studio') {
  if (busy) return;
  if (view !== 'studio') { videoPlayer.pause(); await showView(view); return; }
  if (kind !== editorKind) {
    setBusy(true);
    try {
    await save(); videoPlayer.pause();
    editorSessions.set(editorKind, {job, active, selected: new Set(selected)});
    editorKind = kind;
    const session = editorSessions.get(kind);
    job = session?.job || null; active = null; selected = new Set(session?.selected || []); dirty = false;
    editHistory.clear(); historyJob = job?.id; undoGesture = null;
    syncEditorKind(); renderGrid();
    if (session?.active && job?.media.some(m => m.id === session.active)) activate(session.active);
    else if (job?.media.length) activate(job.media[0].id);
    else { $('editing-name').textContent = 'Selecione uma mídia'; $('editor-controls').inert = true; }
    $('import-status').hidden = true; $('unsupported').hidden = true;
    $('save-state').textContent = job ? 'Edição salva neste PC' : 'Nenhuma edição aberta';
    } finally { setBusy(false); }
  }
  await showView('studio'); syncAudio();
  if (kind === 'video' && info.videoReady === false) toast('Execute Instalar-video.ps1 para habilitar o processamento de vídeos.');
}

function syncAudio() {
  const items = videoSelection(), audible = items.filter(m => m.has_audio);
  const allMuted = audible.length > 0 && audible.every(m => m.settings.mute);
  const mixed = audible.some(m => m.settings.mute) && !allMuted;
  const noAudio = items.length > 0 && audible.length === 0;
  for (const id of ['audio-action', 'export-audio-action']) {
    const button = $(id); button.hidden = editorKind !== 'video';
    button.disabled = busy || !audible.length;
    button.innerHTML = audioIcon(allMuted || noAudio) + `<span>${allMuted ? 'Restaurar áudio' : 'Remover áudio'}</span>`;
    button.setAttribute('aria-pressed', String(allMuted));
  }
  for (const id of ['audio-status', 'export-audio-status']) {
    const el = $(id); el.hidden = editorKind !== 'video';
    el.innerHTML = audioIcon(allMuted || noAudio) + `<span>${!items.length ? 'Selecione um vídeo' : noAudio ? 'Sem faixa de áudio' : mixed ? 'Áudio varia no lote' : allMuted ? 'Sem áudio' : 'Com áudio'}</span>`;
  }
  $('video-export-help').hidden = editorKind !== 'video';
  if (current()?.kind === 'video') videoPlayer.muted = !!current().settings.mute || !current().has_audio;
}

async function toggleAudio() {
  if (busy) return;
  const items = videoSelection().filter(m => m.has_audio);
  if (!items.length) return;
  const mute = !items.every(m => m.settings.mute);
  editSettings(items, () => items.forEach(m => m.settings.mute = mute));
  markDirty(); syncAudio(); syncVideo(); renderGrid();
  toast(mute ? 'Áudio removido dos vídeos selecionados. Os originais são preservados.' : 'Áudio restaurado nos vídeos selecionados.');
  if ($('export-dialog').open) { await save(); await Promise.all([finalPreview(), refreshPlan()]); }
}

function syncVideo() {
  const m = current(), video = m?.kind === 'video';
  document.body.classList.toggle('video-preview-hidden',video&&m.settings.previewVisible===false);
  $('video-timeline').hidden = !video; $('video-options').hidden = !video;
  syncAudio();
  if (!video) { videoPlayer.pause(); videoPlayer.removeAttribute('src'); return; }
  const s = m.settings;
  if(segmentMedia!==m.id){segmentMedia=m.id;selectedSegment=0;}
  selectedSegment=Math.min(selectedSegment,videoSegments(m).length-1);
  const part=videoSegments(m)[selectedSegment];
  const url = '/video/' + m.id;
  if (videoPlayer.getAttribute('src') !== url) {
    videoPlayer.pause(); videoPlayer.src = url;
    videoPlayer.onloadedmetadata = () => { if (current()?.id === m.id) { videoPlayer.currentTime = videoSegments(current())[selectedSegment].start; drawSoon(); syncTimeline(); } };
    videoPlayer.load();
  }
  videoPlayer.playbackRate = s.speed || 1;
  for (const id of ['trim-start', 'trim-end', 'trim-start-handle', 'trim-end-handle', 'video-scrub']) $(id).max = m.duration;
  $('trim-start').value = $('trim-start-handle').value = part.start;
  $('trim-end').value = $('trim-end-handle').value = part.end;
  $('duration-final').value = Number(videoLength(m).toFixed(2));
  $('video-size').value = s.targetMB;
  $('video-speed').textContent = (s.speed || 1).toFixed(2).replace('.', ',') + '×';
  $('video-original-info').textContent = `Original: ${seconds(m.duration)} · ${(m.original_bytes / 1e6).toFixed(1).replace('.', ',')} MB`;
  $('video-speed-warning').hidden = s.speed <= 2;
  $('video-size-warning').hidden = s.targetMB * 8e6 / videoLength(m) >= 850000;
  $('trim-selection').style.left = (part.start / m.duration * 100) + '%';
  $('trim-selection').style.width = ((part.end - part.start) / m.duration * 100) + '%';
  $('timeline-end').textContent = seconds(m.duration);
  renderMontage(m);
  syncTimeline();
}

function syncTimeline() {
  if(typeof project==='function'&&editorKind==='video'&&project()){syncCompositionPosition();return;}
  if (current()?.kind !== 'video') return;
  $('video-scrub').value = videoPlayer.currentTime;
  $('video-position').textContent = seconds(videoPlayer.currentTime);
  setPlayIcon($('video-play'), !videoPlayer.paused, videoPlayer.paused ? 'Reproduzir' : 'Pausar');
  const m=current(),part=videoSegments(m)[selectedSegment];
  $('montage-scrub').value=segmentNow(m,selectedSegment,videoPlayer.currentTime);
  const position=Number($('montage-scrub').value),head=$('montage-playhead');
  $('montage-position').textContent=seconds(position)+' / '+seconds(videoLength(m));
  if(head){head.style.left=Math.min(100,position/videoLength(m)*100)+'%';head.setAttribute('aria-valuenow',position);head.setAttribute('aria-valuetext',seconds(position));}
  $('split-segment').disabled=!!part.locked||videoSegments(m).length>=100||videoPlayer.currentTime<part.start+.1||videoPlayer.currentTime>part.end-.1;
}

function videoFrame(m) {
  if (current()?.id === m.id && videoPlayer.readyState >= 2) return videoPlayer;
  return asset('/media/' + m.id);
}

// Desfocar fundo: a mídia cobre a tela, desfocada, sob a cor escolhida a 50% (igual à exportação).
function drawBlurBackground(ctx, source, s, scale) {
  const sw = source.videoWidth || source.naturalWidth, sh = source.videoHeight || source.naturalHeight;
  if (!sw || !sh) return;
  const sigma = (s.blur ?? 60)/100*.05*Math.max(s.width, s.height), k = Math.max(s.width/sw, s.height/sh), dw = sw*k, dh = sh*k;
  ctx.save(); ctx.translate(s.width/2, s.height/2); ctx.scale(s.flipH?-1:1, s.flipV?-1:1);
  // Sem a borda extra o desfoque escurece os cantos; a exportação repete os pixels da borda.
  const bleed = sigma*2;
  if (sigma > 0) ctx.filter = `blur(${sigma*scale}px)`;
  ctx.drawImage(source, -dw/2-bleed, -dh/2-bleed, dw+bleed*2, dh+bleed*2);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = .5; ctx.fillStyle = s.color; ctx.fillRect(0, 0, s.width, s.height); ctx.restore();
}

function drawVideoCanvas(m, source, canvas, overlay=false) {
  if (!source || source.readyState < 2) return;
  const s = m.settings, scale = Math.min(1, 1280/s.width, 1280/s.height);
  const w = Math.round(s.width*scale), h = Math.round(s.height*scale);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(scale,0,0,scale,0,0);
  if(!overlay){ctx.fillStyle = s.mode === 'background' ? s.color : '#000'; ctx.fillRect(0,0,s.width,s.height);}
  if(!overlay && s.mode === 'blur' && !s.blurHidden) drawBlurBackground(ctx, source, s, scale);
  const {rw,rh,x,y,drawW,drawH}=mediaGeometry(m);
  ctx.save(); ctx.translate(x+rw/2,y+rh/2); ctx.rotate(s.rotation*Math.PI/180); ctx.scale(s.flipH?-1:1,s.flipV?-1:1);
  ctx.drawImage(source,-drawW/2,-drawH/2,drawW,drawH); ctx.restore();
  if (s.logoId) {
    const logo = asset('/logo/'+s.logoId);
    if (logo) { const k=Math.min(s.width*(s.logoScale??.12)/logo.naturalWidth,s.height*.8/logo.naturalHeight),lw=Math.max(1,Math.round(logo.naturalWidth*k)),lh=Math.max(1,Math.round(logo.naturalHeight*k));ctx.drawImage(logo,Math.round((s.width-lw)*(s.logoX??.97)),Math.round((s.height-lh)*(s.logoY??.03)),lw,lh); }
  }
}

function animateVideo() {
  cancelAnimationFrame(videoFrameRequest);
  if (current()?.kind === 'video') {
    const parts=videoSegments(current());
    if (!videoPlayer.paused && videoPlayer.currentTime >= parts[selectedSegment].end) {
      if(selectedSegment<parts.length-1){selectedSegment++;videoPlayer.currentTime=parts[selectedSegment].start;syncVideo();}
      else { videoPlayer.pause(); videoPlayer.currentTime=parts[selectedSegment].end; }
    }
    drawSoon(); syncTimeline();
    if (!videoPlayer.paused) videoFrameRequest = requestAnimationFrame(animateVideo);
  }
}
videoPlayer.addEventListener('play', animateVideo);
videoPlayer.addEventListener('pause', syncTimeline);
videoPlayer.addEventListener('seeked', () => { drawSoon(); syncTimeline(); });
videoPlayer.addEventListener('ended',()=>{const m=current();if(m?.kind!=='video')return;const parts=videoSegments(m);if(videoPlayer.currentTime>=parts[selectedSegment].end-.001){if(selectedSegment===parts.length-1)return;selectedSegment++;videoPlayer.currentTime=parts[selectedSegment].start;syncVideo();}videoPlayer.play().catch(e=>toast(e.message));});
videoPlayer.addEventListener('error', () => toast('Não foi possível abrir a prévia deste vídeo. Tente importar novamente.'));
$('video-play').onclick = () => {
  if (busy || current()?.kind !== 'video') return;
  if (videoPlayer.paused) { const parts=videoSegments(current());if(videoPlayer.currentTime>=parts[selectedSegment].end){selectedSegment=0;syncVideo();}const part=parts[selectedSegment];if(videoPlayer.currentTime<part.start||videoPlayer.currentTime>=part.end)videoPlayer.currentTime=part.start;videoPlayer.play().catch(e => toast(e.message)); }
  else videoPlayer.pause();
};
$('video-scrub').oninput = () => { videoPlayer.pause(); videoPlayer.currentTime = Number($('video-scrub').value); };
$('montage-scrub').oninput=()=>seekMontage(Number($('montage-scrub').value));
$('split-segment').onclick=()=>{const m=current();if(m?.kind!=='video'||$('split-segment').disabled)return;const parts=structuredClone(videoSegments(m)),p=parts[selectedSegment],time=Number(videoPlayer.currentTime.toFixed(3));parts.splice(selectedSegment,1,{start:p.start,end:time},{start:time,end:p.end});commitSegments(parts,selectedSegment+1);toast('Trecho dividido. Remova as partes que não quiser usar.');};
$('remove-segment').onclick=()=>{const m=current();if(m?.kind!=='video'||$('remove-segment').disabled)return;const parts=structuredClone(videoSegments(m));parts.splice(selectedSegment,1);commitSegments(parts);videoPlayer.currentTime=parts[selectedSegment].start;toast('Trecho removido. Os demais foram encaixados.');};
$('add-segment').onclick=()=>{const m=current();if(m?.kind!=='video'||videoSegments(m).length>=100)return;const parts=structuredClone(videoSegments(m)),start=Math.min(Math.max(0,videoPlayer.currentTime),m.duration-.1);parts.push({start:Number(start.toFixed(3)),end:Math.min(m.duration,Number((start+5).toFixed(3)))});commitSegments(parts,parts.length-1);videoPlayer.currentTime=start;toast('Trecho adicionado ao final. Ajuste o início e o fim abaixo.');};
$('segment-left').onclick=()=>moveSegment(selectedSegment,selectedSegment-1);
$('segment-right').onclick=()=>moveSegment(selectedSegment,selectedSegment+1);
$('segment-lock').onclick=()=>{const m=current();if(busy||m?.kind!=='video')return;const parts=structuredClone(videoSegments(m));parts[selectedSegment].locked=!parts[selectedSegment].locked;commitSegments(parts);toast(parts[selectedSegment].locked?'Trecho bloqueado contra cortes, remoção e mudança de ordem.':'Trecho desbloqueado.');};
$('track-visibility').onclick=()=>{if(current()?.kind==='video'){change({previewVisible:current().settings.previewVisible===false});drawSoon();toast(current().settings.previewVisible?'Prévia visível.':'Prévia oculta. Todos os trechos continuam na exportação.');}};

function commitTrim(which, value) {
  const m = current(); if (m?.kind !== 'video' || !Number.isFinite(value)) return;
  const parts=structuredClone(videoSegments(m)),part=parts[selectedSegment];
  if(part.locked){toast('Desbloqueie o trecho pelo cadeado antes de ajustar o corte.');return;}
  if (which === 'trimStart') value = Math.min(Math.max(0,value), part.end-.1);
  else value = Math.max(part.start+.1, Math.min(m.duration,value));
  part[which==='trimStart'?'start':'end']=Number(value.toFixed(3));
  videoPlayer.pause();change({segments:parts,trimStart:parts[0].start,trimEnd:parts[0].end});renderGrid();
  videoPlayer.currentTime = which === 'trimStart' ? value : Math.max(part.start,value-.05);
}
for (const [id, key] of [['trim-start','trimStart'],['trim-start-handle','trimStart'],['trim-end','trimEnd'],['trim-end-handle','trimEnd']]) {
  $(id).oninput = () => { if ($(id).value !== '' && $(id).validity.valid) commitTrim(key, Number($(id).value)); };
}
$('duration-final').onchange = () => {
  const m = current(); if (m?.kind !== 'video') return;
  if(videoSegments(m).some(p=>p.locked)){syncVideo();return;}
  const duration = Number($('duration-final').value), speed = rawVideoLength(m)/duration;
  if (!Number.isFinite(speed) || speed < .25 || speed > 4) { toast('A duração deve corresponder a uma velocidade entre 0,25× e 4×. Se precisar encurtar mais, corte o trecho.'); syncVideo(); return; }
  videoPlayer.pause(); change({speed}); syncVideo();
};
$('normal-speed').onclick = () => { change({speed:1}); syncVideo(); };
$('whole-video').onclick = () => { if (current()?.kind === 'video') { commitSegments([{start:0,end:current().duration}],0);videoPlayer.currentTime=0; } };
$('video-size').onchange = () => { const value=Number($('video-size').value);if(Number.isFinite(value)&&value>=.1&&value<=1000)change({targetMB:value});syncVideo(); };
$('audio-action').onclick = $('export-audio-action').onclick = () => toggleAudio().catch(e => toast(e.message));

function animateFinalVideo() {
  cancelAnimationFrame(finalFrameRequest);
  const m = finalVideoMedia; if (!m) return;
  const parts=videoSegments(m);
  if (!finalPlayer.paused && finalPlayer.currentTime >= parts[finalSegment].end) {
    if(finalSegment<parts.length-1){finalSegment++;finalPlayer.currentTime=parts[finalSegment].start;}
    else { finalPlayer.pause(); finalPlayer.currentTime=parts[finalSegment].end; }
  }
  drawVideoCanvas(m, finalPlayer, $('final-video-canvas'));
  setPlayIcon($('final-video-play'), !finalPlayer.paused, finalPlayer.paused ? 'Reproduzir resultado' : 'Pausar');
  $('final-video-scrub').value = segmentNow(m,finalSegment,finalPlayer.currentTime);
  if (!finalPlayer.paused) finalFrameRequest = requestAnimationFrame(animateFinalVideo);
}
finalPlayer.addEventListener('play', animateFinalVideo);
finalPlayer.addEventListener('seeked', animateFinalVideo);
finalPlayer.addEventListener('pause', animateFinalVideo);
finalPlayer.addEventListener('ended',()=>{if(!finalVideoMedia)return;const parts=videoSegments(finalVideoMedia);if(finalPlayer.currentTime>=parts[finalSegment].end-.001){if(finalSegment===parts.length-1)return;finalSegment++;finalPlayer.currentTime=parts[finalSegment].start;}finalPlayer.play().catch(e=>toast(e.message));});
$('final-video-play').onclick = () => {
  if (!finalVideoMedia) return;
  if (finalPlayer.paused) { const parts=videoSegments(finalVideoMedia);if(finalSegment===parts.length-1&&finalPlayer.currentTime>=parts[finalSegment].end)finalSegment=0;if(finalPlayer.currentTime<parts[finalSegment].start||finalPlayer.currentTime>=parts[finalSegment].end)finalPlayer.currentTime=parts[finalSegment].start;finalPlayer.play().catch(e=>toast(e.message)); } else finalPlayer.pause();
};
$('final-video-scrub').oninput = () => { if(!finalVideoMedia)return;finalPlayer.pause();const position=locateMontage(finalVideoMedia,Number($('final-video-scrub').value));finalSegment=position.index;finalPlayer.currentTime=position.time; };
$('export-dialog').addEventListener('close', () => { finalPlayer.pause(); finalVideoMedia=null; });

const imageFinalPreview = finalPreview;
finalPreview = async function() {
  const m=job?.media.find(m=>m.id===exportIds[previewIndex]), video=m?.kind==='video';
  $('final-image').hidden=!!video; $('final-video-canvas').hidden=!video; $('final-video-controls').hidden=!video;
  finalPlayer.pause(); finalVideoMedia=null;
  if (!video) return imageFinalPreview();
  finalVideoMedia=m;finalSegment=0; $('preview-index').textContent=`${previewIndex+1} / ${exportIds.length}`;
  finalPlayer.src='/video/'+m.id; finalPlayer.muted=!!m.settings.mute||!m.has_audio;finalPlayer.playbackRate=m.settings.speed;
  $('final-video-scrub').min=0;$('final-video-scrub').max=videoLength(m);
  finalPlayer.onloadedmetadata=()=>{finalPlayer.currentTime=videoSegments(m)[0].start;animateFinalVideo();};finalPlayer.load();
  $('final-notes').textContent=`${m.settings.width} × ${m.settings.height} px · ${seconds(videoLength(m))} · até ${m.settings.targetMB} MB · ${m.settings.mute||!m.has_audio?'Sem áudio':'Com áudio'}. Prévia de enquadramento. Confira a nitidez no arquivo exportado.`;
};

const imageOpenExport=openExport;
openExport=async function() { videoPlayer.pause();await imageOpenExport();syncAudio(); };

for (const id of ['trim-start','trim-end','trim-start-handle','trim-end-handle','duration-final','video-size']) {
  $(id).addEventListener('pointerdown',()=>undoGesture=++undoGestureSerial);
  $(id).addEventListener('focus',()=>undoGesture=++undoGestureSerial);
}
const videoShortcuts = [['split-segment','C'],['remove-segment','Delete'],['add-segment','A'],['segment-left','Ctrl + ←'],['segment-right','Ctrl + →'],['normal-speed','V']];
for(const [id,key] of videoShortcuts){const button=$(id);button.title=button.textContent+' ('+key+')';const hint=document.createElement('span');hint.className='shortcut-hint';hint.textContent=key;button.append(hint);}
function syncShortcutTitles(){
  for(const [selector,label,key] of [['#video-play','Reproduzir / pausar','Espaço'],['#audio-action','Remover / restaurar áudio','M'],['[data-transform="right"]','Girar 90° à direita','R'],['[data-transform="left"]','Girar 90° à esquerda','Shift + R'],['[data-transform="horizontal"]','Espelhar horizontalmente','H'],['[data-transform="vertical"]','Espelhar verticalmente','Shift + H'],['#fit-image','Ajustar à tela','F'],['#save','Salvar edição','Ctrl + S'],['#open-export','Revisar e exportar','Ctrl + E']]){const el=document.querySelector(selector);el.title=label+(editorKind==='video'?' ('+key+')':'');}
}
const baseSyncEditorKind=syncEditorKind;
syncEditorKind=function(){baseSyncEditorKind();syncShortcutTitles();};
window.addEventListener('keydown',e=>{
  if(e.defaultPrevented||busy||editorKind!=='video'||current()?.kind!=='video'||$('studio').hidden||document.querySelector('dialog[open]')||e.altKey||e.isComposing)return;
  if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  const key=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;let action=null;
  if(ctrl){
    if(key==='s')action=()=>guard(save);
    else if(key==='e')action=()=>guard(openExport);
    else if(key==='arrowleft')action=()=>moveSegment(selectedSegment,selectedSegment-1);
    else if(key==='arrowright')action=()=>moveSegment(selectedSegment,selectedSegment+1);
  }else{
    const buttons={c:'split-segment',a:'add-segment',delete:'remove-segment',' ':'video-play',v:'normal-speed',f:'fit-image',l:'segment-lock',e:'track-visibility'};
    if(buttons[key])action=()=>$(buttons[key]).click();
    else if(key==='s')action=()=>{videoPlayer.pause();selectSegment(selectedSegment,false);$('montage-track').children[selectedSegment]?.focus();toast('Trecho selecionado. Arraste para mudar a ordem.');};
    else if(key==='r')action=()=>document.querySelector(`[data-transform="${e.shiftKey?'left':'right'}"]`).click();
    else if(key==='h')action=()=>document.querySelector(`[data-transform="${e.shiftKey?'vertical':'horizontal'}"]`).click();
    else if(key==='m')action=()=>toggleAudio().catch(error=>toast(error.message));
    else if(key==='g')action=()=>change({safe:!current().settings.safe});
    else if(key==='t'||key==='p')action=()=>{const field=$(key==='t'?'duration-final':'video-size');field.focus();field.select();};
    else if(key==='i'||key==='o')action=()=>commitTrim(key==='i'?'trimStart':'trimEnd',videoPlayer.currentTime);
    else if(key==='+'||key==='='||key==='-'||key==='_')action=()=>change({zoom:Math.min(5,Math.max(.1,Number((current().settings.zoom+(key==='+'||key==='='?.1:-.1)).toFixed(2))))});
    else if(key==='arrowleft'||key==='arrowright')action=()=>{videoPlayer.pause();const m=current(),position=locateMontage(m,segmentNow(m,selectedSegment,videoPlayer.currentTime)+(key==='arrowright'?1:-1)*(e.shiftKey?1:1/30));selectedSegment=position.index;videoPlayer.currentTime=position.time;syncVideo();};
  }
  if(action){e.preventDefault();if(!e.repeat||['arrowleft','arrowright','+','=','-','_'].includes(key))action();}
});
const baseDrawLive=drawLive;
drawLive=function(){const m=current();if(m?.kind==='video'&&m.settings.previewVisible===false){const c=$('live-preview'),ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#eeeef4';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#64647d';ctx.font=`${Math.max(14,c.width/35)}px Segoe UI`;ctx.textAlign='center';ctx.fillText('Prévia oculta pelo olho',c.width/2,c.height/2);ctx.textAlign='start';return;}baseDrawLive();};
syncEditorKind();
