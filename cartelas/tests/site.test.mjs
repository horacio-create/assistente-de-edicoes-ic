import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSiteUrl,privateAddress,extractSite,rankColors,createSiteService} from '../site.mjs';

test('endereço do site aceita domínio público e recusa redes internas',()=>{
  assert.equal(normalizeSiteUrl('clinica.com.br').href,'https://clinica.com.br/');
  assert.equal(normalizeSiteUrl('http://www.loja.com/#topo').href,'http://www.loja.com/');
  for(const bad of ['','ftp://a.com','http://user:pw@a.com','http://localhost','http://impressora','http://a.com:8080','http://nas.local'])assert.throws(()=>normalizeSiteUrl(bad));
  for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.10','172.20.1.1','169.254.1.1','::1','fd00::1','::ffff:192.168.1.1','100.64.0.1'])assert.equal(privateAddress(ip),true,ip);
  for(const ip of ['8.8.8.8','200.147.1.1','2804:14c::1'])assert.equal(privateAddress(ip),false,ip);
});

test('leitura encontra logo, ícone, cor do tema e variáveis de marca',()=>{
  const html=`<html><head><title>Clínica Aurora</title><meta name="theme-color" content="#7A4E9F"><link rel="stylesheet" href="/css/site.css"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><meta property="og:image" content="https://cdn.aurora.com/share.jpg"><style>:root{--color-primary:#7a4e9f;--brand-accent:rgb(240, 180, 60)}body{color:#333;background:#fff}</style></head><body><img src="/img/logo-aurora.svg" alt="Aurora"><img src="/foto.jpg" alt="equipe"></body></html>`;
  const found=extractSite(html,new URL('https://aurora.com/'));
  assert.equal(found.title,'Clínica Aurora');assert.equal(found.themeColor,'#7A4E9F');
  assert.deepEqual(found.stylesheets,['https://aurora.com/css/site.css']);
  assert.deepEqual(found.images.map(i=>[i.kind,i.url]),[['logo','https://aurora.com/img/logo-aurora.svg'],['icon','https://aurora.com/apple.png'],['social','https://cdn.aurora.com/share.jpg']]);
  const colors=rankColors({themeColor:found.themeColor,css:found.inlineCss.join('\n')});
  assert.equal(colors[0].color,'#7a4e9f');assert.equal(colors[1].color,'#f0b43c');
  assert.ok(colors.findIndex(c=>c.color==='#ffffff')>1,'neutros ficam depois das cores de marca');
});

test('serviço segue redirecionamento público e recusa redirecionamento para rede interna',async()=>{
  const pages={'https://aurora.com/':{status:301,location:'https://www.aurora.com/'},'https://www.aurora.com/':{status:200,type:'text/html',body:'<meta name="theme-color" content="#123456"><img class="logo" src="/l.png">'},'https://www.aurora.com/l.png':{status:200,type:'image/png',body:'png'},'https://evil.com/':{status:302,location:'http://intranet.example/'}};
  const fetchImpl=async url=>{const p=pages[url];if(!p)throw new Error('offline');return new Response(p.body||null,{status:p.status,headers:{...(p.location?{location:p.location}:{}),...(p.type?{'content-type':p.type}:{})}});};
  const resolve=async host=>[{address:host==='intranet.example'?'192.168.0.5':'203.0.113.10'}];
  const service=createSiteService({fetchImpl,resolve});
  const result=await service.read('aurora.com');
  assert.equal(result.site,'https://www.aurora.com');assert.equal(result.colors[0].color,'#123456');assert.equal(result.images.length,1);
  const image=await service.image(result.session,result.images[0].key);assert.equal(image.type,'image/png');
  await assert.rejects(service.read('evil.com'),/rede interna/);
  await assert.rejects(service.image(result.session,'7'),/expirou/);
});

test('paleta padrão do WordPress não aparece como cor da marca',()=>{
  const css='body{--wp--preset--color--vivid-red:#cf2e2e;--wp--preset--color--luminous-vivid-amber:#fcb900;--wp--preset--color--vivid-cyan-blue:#0693e3}.has-vivid-red-color{color:#cf2e2e !important}.has-vivid-cyan-blue-background-color{background-color:#0693e3}header{background:#cc3366}a{color:#cc3366}';
  const colors=rankColors({css}).map(c=>c.color);
  assert.equal(colors[0],'#cc3366');for(const wp of ['#cf2e2e','#fcb900','#0693e3'])assert.ok(!colors.includes(wp),wp);
});
