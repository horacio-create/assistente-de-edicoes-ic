export function validateRecognitionSegments(segments){
  if(!Array.isArray(segments)||segments.length>3000)throw Error('Trechos reconhecidos inválidos.');let length=0;
  for(const s of segments){if(!s||typeof s.text!=='string'||s.text.length>50000)throw Error('Trecho reconhecido inválido.');length+=s.text.length;if(length>100000)throw Error('Trechos reconhecidos muito longos.');if(s.confidence!==undefined&&(!Number.isFinite(s.confidence)||s.confidence<0||s.confidence>1)||s.uncertain!==undefined&&typeof s.uncertain!=='boolean')throw Error('Indicação de leitura inválida.');if(s.start!==undefined||s.end!==undefined){if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start||s.end>601)throw Error('Tempo de áudio inválido.');}}
  return segments;
}
export function recognitionSignals(source){
  const segments=source.segments?.length?source.segments:(source.text||'').split('\n').filter(Boolean).map(text=>({text}));
  return segments.map((s,index)=>{const uncertain=s.uncertain===true||s.confidence!==undefined&&s.confidence<.85;const critical=/@|\d{3,}|R\$\s*\d|\b(?:cliente|nome|telefone|whatsapp|instagram|pre[çc]os?|hor[aá]rios?|chamada|qr|c[oó]digo)\b/i.test(s.text);return {...s,index,attention:uncertain||critical,reason:uncertain?'Leitura incerta':critical?'Conferir nome, contato ou informação importante':''};});
}
export function sourceReviewCounts(sources){return {total:sources.length,reviewed:sources.filter(s=>s.reviewedAt).length,attention:sources.reduce((n,s)=>n+recognitionSignals(s).filter(t=>t.attention).length,0)};}
export function audioTime(seconds){const value=Math.max(0,Math.floor(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
