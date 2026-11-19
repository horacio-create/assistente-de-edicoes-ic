import {cardName} from './workflow-ui.js';
export function issueCategory(message){
  if(/QR Code|QR solicitado/i.test(message))return 'qr';
  if(/fonte|tipografia|texto|título|serviço|exemplo/i.test(message))return 'text';
  if(/foto|logo|material|resolução/i.test(message))return 'assets';
  return 'layout';
}
export function reviewSummary(project,getIssues){
  const cards=project.cards.map(card=>{const messages=getIssues(card),qrMissing=messages.some(m=>/^QR Code solicitado:/i.test(m));return {card,issues:messages.filter(m=>!qrMissing||!/^QR Code: material ausente/i.test(m)).map(message=>({message,category:issueCategory(message)}))};});
  return {cards,total:cards.reduce((sum,c)=>sum+c.issues.length,0),unreviewed:cards.filter(c=>!c.card.approved).length,counts:Object.fromEntries(['text','assets','qr','layout'].map(key=>[key,cards.flatMap(c=>c.issues).filter(i=>i.category===key).length]))};
}
let category='all';
export function renderDeliveryReview(project,getIssues,fix,selectCard){
  const $=id=>document.getElementById(id),checklist=$('delivery-checklist'),summary=reviewSummary(project,getIssues);
  let header=$('review-overview');if(!header){header=document.createElement('section');header.id='review-overview';checklist.before(header);}
  header.replaceChildren();
  const status=document.createElement('p');status.className='review-status';status.setAttribute('role','status');status.textContent=!project.cards.length?'Organize o roteiro para começar a revisão.':summary.total?`${summary.total} pendência(s) · ${summary.unreviewed} cartela(s) aguardando revisão`:summary.unreviewed?`Sem pendências automáticas · ${summary.unreviewed} cartela(s) para conferir`:'Todas as cartelas revisadas por você';header.append(status);
  if(category!=='all'&&!summary.counts[category])category='all';
  const first=summary.cards.map(c=>({...c,issues:c.issues.filter(i=>category==='all'||i.category===category)})).find(c=>c.issues.length)||(category==='all'?summary.cards.find(c=>!c.card.approved):null);
  if(first){const next=document.createElement('button');next.id='review-next';next.className='button full';next.textContent=summary.total?'Resolver próxima pendência →':'Conferir próxima cartela →';next.onclick=()=>first.issues.length?fix(first.card,first.issues[0].message):selectCard(first.card);header.append(next);}
  const labels={all:'Todas',text:'Textos e fontes',assets:'Fotos e logo',qr:'QR Code',layout:'Posições'};
  if(category!=='all'&&!summary.counts[category])category='all';
  if(summary.total){const filters=document.createElement('div');filters.className='review-filters';filters.setAttribute('aria-label','Filtrar pendências');for(const [key,label] of Object.entries(labels)){const count=key==='all'?summary.total:summary.counts[key];if(!count)continue;const button=document.createElement('button');button.className='button'+(category===key?' primary':'');button.dataset.reviewFilter=key;button.textContent=`${label} (${count})`;button.setAttribute('aria-pressed',String(category===key));button.onclick=()=>{category=key;renderDeliveryReview(project,getIssues,fix,selectCard);};filters.append(button);}header.append(filters);}
  checklist.replaceChildren();
  for(const {card,issues} of summary.cards){
    const pending=issues.filter(i=>category==='all'||i.category===category);if(!pending.length&&(card.approved||category!=='all'))continue;
    const group=document.createElement('section');group.className='review-card';group.dataset.reviewCard=card.id;
    const title=document.createElement('h4'),preview=document.createElement('button');preview.className='text-button';preview.textContent=cardName(project,card)+' · Ver prévia';preview.onclick=()=>selectCard(card,{stay:true});title.append(preview);group.append(title);
    for(const issue of pending){const button=document.createElement('button');button.className='issue-action';button.textContent=issue.message+' → Corrigir';button.onclick=()=>fix(card,issue.message);group.append(button);}
    if(!issues.length&&!card.approved){const button=document.createElement('button');button.className='issue-action';button.textContent='Conferir textos, enquadramento e contatos →';button.onclick=()=>selectCard(card);group.append(button);}
    checklist.append(group);
  }
}
