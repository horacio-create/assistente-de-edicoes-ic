/* Referência Uniforça: produto cresce e endireita, informações entram depois,
   leitura em repouso e troca direta de cartela. Sem alterar os ajustes internos. */
(function(global){
  function animar(tl,p,inicio,duracao,indice=0){
    const ritmo=Math.min(1,duracao/2.4);
    const t=inicio+indice*.025*ritmo;
    const box=p.querySelector('.foto-box'),nome=p.querySelector('.nome');
    const selo=p.querySelector('.selo'),valor=p.querySelector('.selo-preco');
    const de=p.querySelector('.de'),seta=p.querySelector('.seta');
    // Cada alvo recebe uma única entrada explícita, segura para seek reverso.
    tl.fromTo(box,{scale:.12,rotation:-24,y:18,opacity:0},
      {scale:1,rotation:0,y:0,opacity:1,duration:.55*ritmo,ease:'power3.out'},t);
    tl.fromTo(nome,{x:14,opacity:0},
      {x:0,opacity:1,duration:.25*ritmo,ease:'power2.out'},t+.32*ritmo);
    tl.fromTo(selo,{scaleX:.06,opacity:0},
      {scaleX:1,opacity:1,duration:.24*ritmo,ease:'power2.out',transformOrigin:'left center'},t+.46*ritmo);
    tl.fromTo(valor,{y:8,opacity:0},
      {y:0,opacity:1,duration:.2*ritmo,ease:'power2.out'},t+.65*ritmo);
    if(de)tl.fromTo(de,{y:8,opacity:0},
      {y:0,opacity:1,duration:.23*ritmo,ease:'power2.out'},t+.52*ritmo);
    if(seta)tl.fromTo(seta,{opacity:0},
      {opacity:1,duration:.16*ritmo,ease:'none'},t+.68*ritmo);
    // Nenhum pulso ou tween de saída: o runtime troca os painéis no limite.
  }
  global.AnimacaoOfertas={animar};
  if(typeof module!=='undefined')module.exports={animar};
})(globalThis);
