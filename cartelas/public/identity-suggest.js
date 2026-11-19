// Proposes Principal / Destaque / Fundo from the colors found on the client's site and feed.
// Site colors with an explicit brand signal (theme color, --primary variables) come first.
const rgb=hex=>hex.slice(1).match(/../g).map(n=>parseInt(n,16));
const distance=(a,b)=>Math.hypot(...rgb(a).map((n,i)=>n-rgb(b)[i]));
const luminance=hex=>{const [r,g,b]=rgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
const chroma=hex=>{const v=rgb(hex);return Math.max(...v)-Math.min(...v);};
const valid=hex=>typeof hex==='string'&&/^#[0-9a-f]{6}$/i.test(hex);

export function identityCandidates({siteColors=[],feedColors=[]}={}){
  const list=[],add=(hex,source,strong=false)=>{if(!valid(hex))return;hex=hex.toLowerCase();const near=list.find(c=>distance(c.hex,hex)<28);if(near){near.sources.add(source);near.strong||=strong;return;}list.push({hex,sources:new Set([source]),strong});};
  for(const c of siteColors)if(c&&c.reason&&c.reason!=='Usada no visual do site')add(c.color,'site',true);
  for(const c of feedColors)add(c.hex,'feed');
  for(const c of siteColors)add(c?.color,'site');
  return list.map(c=>({hex:c.hex,sources:[...c.sources],strong:c.strong}));
}

export function suggestPalette(input){
  const candidates=identityCandidates(input);
  if(!candidates.length)return null;
  const light=c=>luminance(c.hex)>.82&&chroma(c.hex)<40;
  const background=candidates.find(light)?.hex||'#ffffff';
  // Principal: the first color with identity (saturated, or a deep tone) that is not the background.
  const usable=candidates.filter(c=>distance(c.hex,background)>60);
  const brand=c=>chroma(c.hex)>=40||luminance(c.hex)<.08;
  const primary=(usable.find(c=>c.strong&&brand(c))||usable.find(brand)||usable[0])?.hex||'#222222';
  // Destaque: a clearly different saturated color; otherwise a darker or lighter partner of the primary.
  const accent=usable.find(c=>c.hex!==primary&&chroma(c.hex)>=40&&distance(c.hex,primary)>70)?.hex
    ||usable.find(c=>c.hex!==primary&&distance(c.hex,primary)>70)?.hex
    ||(luminance(primary)>.3?'#222222':'#f2f2f2');
  const from=hex=>candidates.find(c=>c.hex===hex)?.sources||[];
  return {primary,accent,background,sources:{primary:from(primary),accent:from(accent),background:from(background)},candidates:candidates.map(c=>c.hex).slice(0,12)};
}
