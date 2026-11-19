import {parseBrief} from './core.js';
import {narrativeInformation,sameInformation} from './narrative.js';
import {applyCorrections,validateEvidence,withoutCorrectionLines} from './corrections.js';
import {validateRecognitionSegments} from './source-review.js';
const clean=text=>text.replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\r\n?/g,'\n').trim();
const numbers={um:1,uma:1,primeira:1,dois:2,duas:2,segunda:2,tres:3,'três':3,terceira:3,quatro:4,quarta:4,cinco:5,quinta:5,seis:6,sete:7,oito:8,nove:9,dez:10};
// A refusal is not a QR request. Later instructions replace earlier ones.
// "Não gerar outro QR" still refers to an asset supplied by the client.
function requestedQr(sources){
  let requested=false;
  for(const source of sources)for(const sentence of (source.text||'').split(/[\n.!?]+/)){
    const mention=/\b(?:qr\s*(?:code|c[oó]digo)?|c[oó]digo\s+qr)\b/i.exec(sentence);
    if(!mention)continue;
    const before=sentence.slice(0,mention.index),after=sentence.slice(mention.index+mention[0].length);
    const refusal=/(?:\bsem\s+(?:o\s+)?(?:c[oó]digo\s+)?|\bn[aã]o\s+(?:precisamos|queremos|quero|preciso|incluir|inclua|usar|use|colocar|coloque|reservar|ter|haver[aá]|vai\s+ter|vamos\s+(?:usar|incluir)|[ée]\s+necess[aá]rio)\b[^.!?\n]{0,60}|\bdispens(?:ar|amos|o)\b[^.!?\n]{0,40})$/i.test(before)||/^\s*(?:n[aã]o\s+(?:[ée]\s+necess[aá]rio|ser[aá]\s+usado|deve\s+aparecer)|dispensado|desnecess[aá]rio)/i.test(after);
    requested=!refusal;
  }
  return requested;
}
export function normalizeSpokenScript(text){
  if(/^\s*Cartela\s*\d+\s*[-–—:]\s*/im.test(text))return clean(text);
  const value=clean(text).replace(/\bcartela\s+(um|uma|primeira|dois|duas|segunda|três|tres|terceira|quatro|quarta|cinco|quinta|seis|sete|oito|nove|dez|\d+)\b/gi,(_,n)=>`\nCartela ${numbers[n.toLowerCase()]||n}`);
  return value.replace(/^(Cartela \d+)\s*[,.:;-]?\s*/gm,'$1 - ').replace(/^(Cartela \d+ - [^\n]*?\b(?:logo|foto|texto|servi[çc]os|contatos?|qr code)[^\n]*?)\.\s+(?=\S)/gmi,'$1\n').trim();
}
export function suggestBriefing(sources){
  const originals=sources;sources=sources.map(s=>({...s,text:withoutCorrectionLines(s.text)}));
  const combined=clean(sources.map(s=>s.text||'').join('\n')),warnings=[];
  if(originals.reduce((sum,s)=>sum+(s.text||'').length,0)>150000)throw new Error('O texto é grande demais. Divida o pedido em partes.');
  if(combined.length>150000)throw new Error('O texto é grande demais. Divida o pedido em partes.');
  const phones=[...new Map((combined.match(/(?:\+55\s*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}/g)||[]).map(phone=>[phone.replace(/\D/g,''),phone])).values()];
  const profiles=[...new Map((combined.match(/@[\w.]+/g)||[]).map(profile=>{const value=profile.replace(/\.+$/,'');return [value.toLowerCase(),value];})).values()];
  if(phones.length>1)warnings.push('Há mais de um telefone nas fontes. Escolha o correto ou mantenha todos conscientemente.');
  if(profiles.length>1)warnings.push('Há mais de um perfil nas fontes. Confira quais devem aparecer.');
  const scripts=sources.map(s=>({name:s.name,text:normalizeSpokenScript(s.text||'')})).filter(s=>/^Cartela\s+\d+/im.test(s.text));
  let script='';if(scripts.length){script=scripts[0].text;try{parseBrief(script);}catch(err){warnings.push('O roteiro identificado precisa de ajuste: '+err.message);}
    if(scripts.length>1)warnings.push(`Foram encontrados roteiros em ${scripts.length} fontes. A proposta usa “${scripts[0].name}”; confira os demais antes de aplicar.`);
  }
  const label=(pattern)=>combined.match(pattern)?.[1]?.trim()||'';
  let clientName=label(/^(?:cliente|nome|profissional)\s*[:=-]\s*(.+)$/im);
  if(!clientName)clientName=combined.match(/\b(?:Dra\.?|Dr\.?|Doutora|Doutor)\s+[A-ZÀ-Ü][^\n,;.]{2,90}/i)?.[0]?.trim()||'';
  let subtitle=label(/^(?:área|area|especialidade|atividade|subtítulo|subtitulo)\s*[:=-]\s*(.+)$/im);
  let cta=label(/^(?:chamada|frase|cta|slogan|mensagem final)\s*[:=-]\s*(.+)$/im);
  const items=[];
  for(const source of sources){
    // List context belongs to its source, never to the next audio or screenshot.
    let collecting=false,mode=null;
    for(const line of clean(source.text||'').split('\n').map(l=>l.trim())){
      if(/^(?:corrigindo|corre[çc][aã]o|atualiza[çc][aã]o|troque|altere|corrija|atualize|substitua|retire|remova|exclua|inclua|adicione|acrescente|não inclua)\b/i.test(line)){collecting=false;mode=null;continue;}
      if(/^(?:servi[çc]os|procedimentos|produtos)\s*[:=-]/i.test(line)){collecting=true;mode=null;const rest=line.replace(/^[^:=-]+[:=-]\s*/,'');if(rest)items.push(rest.replace(/^[•●▪·*-]\s*/,''));continue;}
      if(/^(?:contatos?|telefone|whatsapp|perfil|instagram|chamada|frase|cta|slogan|cliente|nome|área|area|cartela)\b/i.test(line)){collecting=false;mode=null;continue;}
      if(/^[•●▪·*-]\s*\S/.test(line)){items.push(line.replace(/^[•●▪·*-]\s*/,''));if(collecting)mode='bullets';}
      else if(collecting&&line){if(mode==='bullets'){collecting=false;continue;}if(!phones.includes(line)&&!line.startsWith('@')){items.push(line);mode='plain';}}
    }
  }
  const spoken=sources.map(source=>({...narrativeInformation(source),source}));
  const choose=(key,current)=>{
    const candidates=spoken.filter(result=>result.fields[key]);
    const selected=current||candidates[0]?.fields[key]||'';
    if(candidates.some(result=>!sameInformation(result.fields[key],selected)))warnings.push(`Há propostas diferentes para ${ {clientName:'nome do cliente',subtitle:'especialidade',cta:'chamada',services:'serviços'}[key] }. A proposta prioriza os campos escritos; confira as fontes.`);
    if(!current&&selected)warnings.push(`Sugestão de ${{clientName:'nome',subtitle:'especialidade',cta:'chamada',services:'serviços'}[key]} obtida de frases em “${candidates[0].source.name}”. Confira o trecho original.`);
    return selected;
  };
  clientName=choose('clientName',clientName);subtitle=choose('subtitle',subtitle);cta=choose('cta',cta);
  const spokenServices=choose('services',items.join('\n'));if(!items.length&&spokenServices)items.push(...spokenServices.split('\n'));
  for(const result of spoken)warnings.push(...result.warnings);
  if(sources.some(s=>s.kind==='audio')&&!phones.length&&!profiles.length)warnings.push('Não foram identificados contatos escritos em números ou @perfil. Confira se foram enviados em outra mensagem; os campos permanecem vazios.');
  if(sources.some(s=>s.kind==='audio'&&/c[oó]digo/i.test(s.text))&&!/\bqr\b/i.test(combined))warnings.push('O áudio menciona um código, mas QR Code não foi reconhecido claramente. Confirme o pedido antes de marcar a opção.');
  if(!clientName)warnings.push('Nome do cliente não identificado. Preencha antes de gerar pelas informações.');
  if(!items.length&&!script)warnings.push('Lista de serviços não identificada. Confira o texto reconhecido e preencha o campo.');
  warnings.push('Revise nomes, telefones, perfis e termos técnicos. A organização usa regras; não interpreta todas as formas de conversa.');
  const notices=[...new Set(warnings)];if(notices.length>30)notices.splice(29,notices.length-29,'Há outros avisos nas fontes. Confira cada mensagem e arquivo antes de usar o roteiro.');
  const corrected=applyCorrections({clientName,subtitle,services:[...new Set(items)].join('\n'),cta,phone:phones.join('\n'),profile:profiles.join('\n'),logo:true,photos:true,qr:requestedQr(sources)},originals);
  if(script&&corrected.corrections.some(c=>c.status==='applied')){script='';notices.push('Há correções posteriores ao roteiro encontrado. Gere novamente pelos campos revisados ou confira o roteiro original na fonte.');}
  const currentNotices=notices.filter(w=>!(corrected.fields.clientName&&w.startsWith('Nome do cliente não identificado'))&&!(corrected.fields.services&&w.startsWith('Lista de serviços não identificada')));
  return {script,warnings:[...new Set([...corrected.warnings,...currentNotices])].slice(0,30),fields:corrected.fields,origins:corrected.origins,corrections:corrected.corrections};
}
export function formatBriefing(fields){
  if(!fields.clientName?.trim())throw new Error('Preencha o nome do cliente.');
  const lines=value=>clean(value||'').split('\n').filter(Boolean);
  const logo=fields.logo?'Logo + ':'',photo1=fields.photos?' + Foto 1':'',photo2=fields.photos?' + Foto 2':'';
  const intro=`Cartela 1 - ${logo}texto${photo1}\n${fields.clientName.trim()}${fields.subtitle?.trim()?'\n'+fields.subtitle.trim():''}`;
  const services=lines(fields.services);const cards=[intro];
  if(services.length)cards.push(`Cartela ${cards.length+1} - ${fields.logo?'Logo como assinatura + ':''}serviços${photo2}\n${services.map(s=>'• '+s.replace(/^[•●▪*-]\s*/,'')).join('\n')}`);
  const contacts=[...lines(fields.phone),...lines(fields.profile)];
  if(contacts.length||fields.cta?.trim()||fields.qr)cards.push(`Cartela ${cards.length+1} - ${logo}texto + informações de contato${fields.qr?' + QR Code':''}\n${fields.cta?.trim()||'Informações de contato'}${contacts.length?'\n'+contacts.join('\n'):''}`);
  return cards.join('\n\n');
}
export function validateBriefingSources(sources){
  if(!Array.isArray(sources)||sources.length>20)throw new Error('Fontes do briefing inválidas.');let size=0;const ids=new Set();
  for(const source of sources){if(!source||typeof source.id!=='string'||!source.id||source.id.length>100||ids.has(source.id)||typeof source.name!=='string'||source.name.length>240||!['text','image','audio'].includes(source.kind)||typeof source.text!=='string'||source.text.length>50000||!Array.isArray(source.warnings)||source.warnings.length>30||source.warnings.some(w=>typeof w!=='string'||w.length>1000))throw new Error('Fonte do briefing inválida.');ids.add(source.id);size+=source.text.length;}
  for(const source of sources){if(source.segments!==undefined)validateRecognitionSegments(source.segments);if(source.reviewedAt!==undefined&&source.reviewedAt!==null&&(typeof source.reviewedAt!=='string'||!Number.isFinite(Date.parse(source.reviewedAt))))throw new Error('Revisão da fonte inválida.');}
  if(size>150000)throw new Error('As fontes do briefing excedem o limite de texto.');return sources;
}
export function validateIntakeDraft(draft){
  validateEvidence(draft||{});
  if(!draft||!draft.fields||typeof draft.script!=='string'||draft.script.length>50000||!Array.isArray(draft.warnings)||draft.warnings.length>30||draft.warnings.some(w=>typeof w!=='string'||w.length>1000))throw new Error('Revisão do briefing inválida.');
  for(const [key,max] of Object.entries({clientName:300,subtitle:500,services:10000,cta:1000,phone:1000,profile:1000}))if(typeof draft.fields[key]!=='string'||draft.fields[key].length>max)throw new Error('Informações do briefing excedem o limite. Revise os campos.');
  for(const key of ['logo','photos','qr'])if(typeof draft.fields[key]!=='boolean')throw new Error('Materiais do briefing inválidos.');return draft;
}
