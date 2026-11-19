export const LAYOUT_CATEGORIES=[
  {id:'health',name:'Saúde e estética',collections:['consultorio','atelier','care','lumina']},
  {id:'commerce',name:'Comércio e alimentação',collections:['vitrine','oferta','onda','table','bold']},
  {id:'education',name:'Educação e institucional',collections:['school']},
  {id:'events',name:'Eventos, academias e portfólio',collections:['impacto','nocturne']}
];
export function collectionCategory(collection){return LAYOUT_CATEGORIES.find(c=>c.id===collection.category||c.collections.includes(collection.id))||{id:'other',name:'Outros estilos'};}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function carouselMarkup(id,title,cards){
  if(!cards.length)return '';
  return `<section class="layout-carousel" aria-label="${escape(title)}"><div class="carousel-heading"><h3>${escape(title)}</h3><div class="carousel-paging"><span class="carousel-status" aria-live="polite"></span><button type="button" data-carousel-step="-1" aria-label="Layouts anteriores: ${escape(title)}">‹</button><button type="button" data-carousel-step="1" aria-label="Próximos layouts: ${escape(title)}">›</button></div></div><div class="carousel-track" id="${escape(id)}" tabindex="0" aria-label="Opções de ${escape(title)}">${cards.join('')}</div></section>`;
}
export function connectCarousels(root){
  const cleanups=[];
  for(const row of root.querySelectorAll('.layout-carousel')){
    const track=row.querySelector('.carousel-track'),previous=row.querySelector('[data-carousel-step="-1"]'),next=row.querySelector('[data-carousel-step="1"]'),status=row.querySelector('.carousel-status');
    const metrics=()=>{const count=track.children.length,visible=Math.max(1,Math.round(Number(getComputedStyle(track).getPropertyValue('--carousel-visible'))||2)),stride=(track.firstElementChild?.getBoundingClientRect().width||0)+(parseFloat(getComputedStyle(track).columnGap)||0);return {count,visible,stride,start:stride?Math.round(track.scrollLeft/stride):0};};
    function sync(){const {count,visible,start}=metrics();previous.disabled=track.scrollLeft<2;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;status.textContent=`${Math.min(count,start+1)}–${Math.min(count,start+visible)} de ${count}`;}
    function move(direction){const {count,visible,stride,start}=metrics(),target=Math.max(0,Math.min(count-visible,start+direction*visible));track.scrollTo({left:target*stride,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    previous.onclick=()=>move(-1);next.onclick=()=>move(1);
    const keyboard=e=>{if(e.target===track&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}};
    track.addEventListener('scroll',sync,{passive:true});track.addEventListener('keydown',keyboard);
    const resize=new ResizeObserver(sync);resize.observe(track);sync();cleanups.push(()=>{resize.disconnect();track.removeEventListener('scroll',sync);track.removeEventListener('keydown',keyboard);});
  }
  return ()=>cleanups.forEach(clean=>clean());
}
