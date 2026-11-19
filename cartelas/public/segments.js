// Local suggestions only. A segment never invents a product, price or contact.
export const SEGMENTS=[
  {id:'restaurant',name:'Restaurantes e alimentação',heading:'Nossos sabores'},
  {id:'health',name:'Saúde e estética',heading:'Procedimentos'},
  {id:'retail',name:'Comércio e produtos',heading:'Produtos em destaque'},
  {id:'education',name:'Educação',heading:'Atividades e formação'},
  {id:'events',name:'Eventos e experiências',heading:'Experiências'},
  {id:'general',name:'Outros / serviços',heading:'Serviços'}
];
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clues={restaurant:[/restaurante|bistro|lanchonete|pizzaria/,/cozinha|gastronom|cardapio/,/baiao|carne de sol|feijoada|churrasco/,/sobremesa|hamburguer|pizza|cafeteria/],health:[/clinica|odont|dermatolog|fisioterap/,/harmoniz|preenchimento|botulin/,/rino|bioestimul|limpeza de pele/],retail:[/loja|varejo|comercio|supermercado/,/produtos|vestuario|calcados|eletrodomesticos/,/materiais de construcao|acabamentos|ferramentas/],education:[/escola|colegio|educacao|pedagog/,/matricula|ensino|formacao|aprendizagem/,/robotica|ingles|educacao infantil/],events:[/eventos|casamento|buffet|cerimonial/,/decoracao de festas|producao de eventos|aniversario/]} ;
const collectionSegments={table:'restaurant',serena:'health',atelier:'health',care:'health',lumina:'health',bold:'retail',school:'education',nocturne:'events',vitrine:'retail',onda:'retail',oferta:'restaurant',consultorio:'health',impacto:'general'};
export function resolveSegment(project,collectionId){
  const explicit=SEGMENTS.find(s=>s.id===project.segment);if(explicit)return {...explicit,source:'manual'};
  const identity=normalized([project.name,project.intakeDraft?.fields?.subtitle,project.intakeDraft?.fields?.clientName].join(' '));
  const content=normalized([project.brief,...(project.cards||[]).flatMap(c=>[c.content?.title===c.automaticTitle?'':c.content?.title,c.content?.body,c.rawContent])].join(' '));
  const scores=Object.entries(clues).map(([id,patterns])=>({id,score:patterns.reduce((n,p)=>n+(p.test(identity)?3:0)+(p.test(content)?1:0),0)})).sort((a,b)=>b.score-a.score);
  // Ties are intentionally neutral: let the designer choose rather than guess.
  const detected=scores[0].score>0&&scores[0].score>scores[1].score?scores[0].id:null;
  const id=detected||(!scores[0].score&&collectionSegments[collectionId])||'general';
  return {...SEGMENTS.find(s=>s.id===id),source:detected?'content':id==='general'?'neutral':'collection'};
}
export function adaptSectionHeading(card,segment){
  if(card.kind!=='services')return card;
  const layer=card.layers.find(l=>l.role==='title'),current=layer?.text??card.content.title;
  const generated=card.automaticTitle;
  if(current!==generated&&!(generated===undefined&&current==='Serviços'))return card;
  if(layer)layer.text=segment.heading;
  card.content.title=segment.heading;card.automaticTitle=segment.heading;
  return card;
}
