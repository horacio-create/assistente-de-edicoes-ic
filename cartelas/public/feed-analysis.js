export function feedCells(crop={x:0,y:0,w:1,h:1},rows=3,columns=3){
  if(!crop||[crop.x,crop.y,crop.w,crop.h].some(v=>!Number.isFinite(v))||crop.x<0||crop.y<0||crop.w<=0||crop.h<=0||crop.x+crop.w>1.00001||crop.y+crop.h>1.00001||!Number.isInteger(rows)||rows<1||rows>6||!Number.isInteger(columns)||columns<1||columns>3)throw Error('Ajuste a área e use de 1 a 6 linhas e de 1 a 3 colunas.');
  return Array.from({length:rows*columns},(_,i)=>({x:crop.x+(i%columns)*crop.w/columns,y:crop.y+Math.floor(i/columns)*crop.h/rows,w:crop.w/columns,h:crop.h/rows}));
}
export function feedSummary(samples,patterns){
  const n=samples.length;return {total:n,repeated:patterns.filter(p=>p.sources.length>=2).map(p=>({id:p.id,label:p.label,count:p.sources.length,total:n})),isolated:patterns.filter(p=>p.sources.length===1).length};
}
