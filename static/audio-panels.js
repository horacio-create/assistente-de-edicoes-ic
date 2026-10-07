'use strict';

for(const button of document.querySelectorAll('button.close'))button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function mediaTypeIcon(kind){
 const paths={image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',video:'<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',audio:'<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>'};
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[kind]||paths.image)+'</svg>';
}
function audioWaveform(m,c){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('audio-waveform');svg.setAttribute('viewBox','0 0 512 50');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 const peaks=m.waveform||[],largest=Math.max(.001,...peaks),duration=m.duration||1,upper=[],lower=[];
 for(let x=0;x<=512;x++){
  const start=Math.max(0,Math.min(peaks.length-1,Math.floor((c.in+(c.out-c.in)*x/512)/duration*peaks.length)));
  const end=Math.max(start+1,Math.min(peaks.length,Math.ceil((c.in+(c.out-c.in)*(x+1)/512)/duration*peaks.length)));
  let level=0;for(let i=start;i<end;i++)level=Math.max(level,peaks[i]||0);
  const height=level/largest*23;upper.push(x+','+(25-height).toFixed(2));lower.unshift(x+','+(25+height).toFixed(2));
 }
 const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d','M'+upper.join(' L')+' L'+lower.join(' L')+' Z');svg.append(shape);return svg;
}

// Only the shared media/project library and the timeline split can be resized.
let panelPrefs={library:160,preview:.55};
try{const saved=JSON.parse(localStorage.getItem('indoor-video-panels')||'null');if(saved&&Number.isFinite(saved.library)&&Number.isFinite(saved.preview))panelPrefs=saved;}catch{}
const savePanelPrefs=()=>{try{localStorage.setItem('indoor-video-panels',JSON.stringify(panelPrefs));}catch{}};
function panelSeparator(id,orientation,label){
 const bar=document.createElement('div');bar.id=id;bar.className='panel-separator '+orientation;bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-orientation',orientation);bar.setAttribute('aria-label',label);bar.dataset.help='Arraste para redimensionar. Use as setas do teclado ou dê dois cliques para restaurar.';return bar;
}
const libraryDivider=panelSeparator('library-resizer','vertical','Redimensionar biblioteca de mídias e edição');
const timelineDivider=panelSeparator('timeline-resizer','horizontal','Redimensionar timeline e prévia');
library.after(libraryDivider);videoTop.after(timelineDivider);
function panelLimits(){
 const width=videoTop.clientWidth,height=Math.max(1,canvasColumn.clientHeight-12-8);
 return {width,height,minWidth:Math.min(120,width*.35),maxWidth:Math.max(120,Math.min(width*.55,width-180)),minShare:Math.min(.45,130/height),maxShare:Math.max(.55,1-110/height)};
}
function applyPanelPrefs(){
 if(!document.body.classList.contains('video-workspace'))return;
 const lim=panelLimits();if(lim.width<=0)return;
 panelPrefs.library=Math.max(lim.minWidth,Math.min(lim.maxWidth,panelPrefs.library));panelPrefs.preview=Math.max(lim.minShare,Math.min(lim.maxShare,panelPrefs.preview));
 videoTop.style.setProperty('--library-width',panelPrefs.library+'px');canvasColumn.style.setProperty('--preview-fr',panelPrefs.preview+'fr');canvasColumn.style.setProperty('--timeline-fr',(1-panelPrefs.preview)+'fr');
 for(const [bar,value,min,max] of [[libraryDivider,panelPrefs.library,lim.minWidth,lim.maxWidth],[timelineDivider,panelPrefs.preview*100,lim.minShare*100,lim.maxShare*100]]){bar.setAttribute('aria-valuenow',Math.round(value));bar.setAttribute('aria-valuemin',Math.round(min));bar.setAttribute('aria-valuemax',Math.round(max));}
 fitStage();
}
for(const [bar,horizontal] of [[libraryDivider,false],[timelineDivider,true]]){
 let drag=null;
 bar.onpointerdown=e=>{if(e.button!==0||busy)return;e.preventDefault();stopComposition();drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,width:panelPrefs.library,share:panelPrefs.preview,height:panelLimits().height};bar.setPointerCapture(e.pointerId);bar.classList.add('resizing');};
 bar.onpointermove=e=>{if(!drag)return;if(horizontal)panelPrefs.preview=drag.share+(e.clientY-drag.y)/drag.height;else panelPrefs.library=drag.width+e.clientX-drag.x;applyPanelPrefs();};
 bar.onpointerup=bar.onpointercancel=e=>{if(!drag)return;drag=null;bar.classList.remove('resizing');if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);savePanelPrefs();renderLayeredTimeline();};
 bar.ondblclick=()=>{if(busy)return;if(horizontal)panelPrefs.preview=.55;else panelPrefs.library=160;applyPanelPrefs();savePanelPrefs();};
 bar.onkeydown=e=>{if(busy)return;const keys=horizontal?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];if(!keys.includes(e.key))return;e.preventDefault();if(horizontal)panelPrefs.preview+=(e.key===keys[0]?-20:20)/panelLimits().height;else panelPrefs.library+=e.key===keys[0]?-20:20;applyPanelPrefs();savePanelPrefs();renderLayeredTimeline();};
}
const panelsObserver=new ResizeObserver(()=>applyPanelPrefs());panelsObserver.observe(canvasColumn);
// Geometry controls belong to visible media; audio retains cuts, duration and speed.
const visualAdjustments=document.createElement('section');visualAdjustments.className='visual-adjustments';
const firstVisual=document.querySelector('.adjustments label[for="mode"]');
if(firstVisual){firstVisual.before(visualAdjustments);let el=firstVisual;while(el&&el!==shortcuts){const next=el.nextElementSibling;visualAdjustments.append(el);el=next;}}
const panelsSyncKind=syncEditorKind;syncEditorKind=function(){panelsSyncKind();document.body.classList.remove('audio-selection');applyPanelPrefs();};
applyPanelPrefs();
