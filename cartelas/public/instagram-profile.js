export function instagramUsername(value){
  if(typeof value!=='string')throw Error('Informe o @ ou endereço do perfil profissional.');
  let name=value.trim();
  if(/^https?:\/\//i.test(name)){let url;try{url=new URL(name);}catch{throw Error('Endereço de Instagram inválido.');}if(url.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash)throw Error('Use o endereço direto do perfil no Instagram.');name=url.pathname.replace(/^\/|\/$/g,'');}
  name=name.replace(/^@/,'');
  if(!/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(name)||name.includes('..')||['p','reel','reels','stories','explore','accounts','direct'].includes(name.toLowerCase()))throw Error('Informe um perfil, como @minhaempresa, sem links de publicações.');
  return name.toLowerCase();
}
