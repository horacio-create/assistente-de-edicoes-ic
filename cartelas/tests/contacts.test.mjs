import test from 'node:test';import assert from 'node:assert/strict';
import {blankProject,parseBrief,composeCard,validateProject,qrLayer,arrangeQr} from '../public/core.js';
import {COLLECTIONS,applyCollection} from '../public/design-presets.js';
import {contactItems,contactBody,buildContactList,flattenContacts,suggestContactIcon,contactPreset} from '../public/contact-list.js';
import {captureTemplate,applyTemplate} from '../public/templates.js';
import {SOLID_ICONS,iconSvg,validateIconAppearance,iconLayer} from '../public/icons.js';
const work=body=>{const p=blankProject();p.cards=parseBrief('Cartela 1 - contatos sem QR Code\nRealce sua beleza\n'+body).cards.map(c=>composeCard(c,p.theme,p.palette));return p;};
test('contatos sugerem canais sem confundir email/endereço e separam telefone/perfil na mesma linha',()=>{
 assert.equal(suggestContactIcon('(88) 99234-8066'),'whatsapp');assert.equal(suggestContactIcon('(88) 3234-8066'),'phone');assert.equal(suggestContactIcon('E-mail: contato@clinica.com'),null);assert.equal(suggestContactIcon('Rua das Flores, 120'),null);
 const body='(88) 99234-8066 @dravictoriadaponte',p=work(body),items=contactItems(p.cards[0]);assert.deepEqual(items.map(i=>i.icon),['whatsapp','camera']);assert.equal(contactBody(items),body);
});
test('sete coleções incluem ícones de contatos e preservam textos, inclusive conteúdo na mesma linha',()=>{
 for(const {id} of COLLECTIONS){const p=work('(88) 99234-8066 @dravictoriadaponte'),content=structuredClone(p.cards[0].content);applyCollection(p,id,{keepIdentity:false});const card=p.cards[0];assert.deepEqual(card.content,content);assert.deepEqual(card.layers.filter(l=>l.role==='contactIcon').map(l=>l.icon),['whatsapp','camera']);assert.equal(card.layers.filter(l=>l.role==='contactText').length,2);validateProject(p);
  const once=card.layers.length;applyCollection(p,id);assert.equal(p.cards[0].layers.length,once);assert.deepEqual(p.cards[0].content,content);
 }
});
test('símbolos manuais e sem ícone sobrevivem à recomposição; modelo não leva os contatos do cliente',()=>{
 const p=work('(88) 99234-8066\n@dravictoriadaponte');applyCollection(p,'lumina',{keepIdentity:false});let card=p.cards[0],items=contactItems(card);items[0].icon='phone';items[1].icon=null;buildContactList(card,p.palette,items);applyCollection(p,'care');card=p.cards[0];assert.deepEqual(contactItems(card).map(i=>i.icon),['phone',null]);
 composeCard(card,p.theme,p.palette);assert.deepEqual(contactItems(card).map(i=>i.icon),['phone',null]);
 const model=captureTemplate(p,card,'Contato com símbolos');assert.ok(model.contactLayout);assert.doesNotMatch(JSON.stringify(model),/99234|dravictoria/);assert.equal(model.layers.some(l=>l.role==='contactText'),false);
 const target=work('(00) 90000-0000\n@outro_cliente');applyTemplate(target,target.cards[0],model);assert.match(contactBody(contactItems(target.cards[0])),/@outro_cliente/);validateProject(target);
});
test('texto simples e QR recebido depois mantêm informações e área segura',()=>{
 const p=work('(88) 99234-8066\n@dravictoriadaponte');applyCollection(p,'lumina',{keepIdentity:false});const card=p.cards[0],body=card.content.body;card.layers.push(qrLayer(null));arrangeQr(card);const qr=card.layers.find(l=>l.role==='qr');for(const row of card.layers.filter(l=>l.role==='contactText'))assert.ok(row.x+row.w<=qr.x-60);
 flattenContacts(card);delete card.contactLayout;assert.equal(card.layers.find(l=>l.role==='body').text,body);assert.equal(card.layers.some(l=>l.role==='contactIcon'),false);validateProject(p);
});
test('contatos inválidos não modificam a cartela parcialmente',()=>{
 const p=work('(88) 99234-8066'),c=p.cards[0],before=structuredClone(c);assert.throws(()=>buildContactList(c,p.palette,[{id:'bad',text:'Telefone',icon:'inválido'}]));assert.deepEqual(c,before);
});
test('contatos preenchidos guardam cores próprias, fundo sólido e canal em todas as coleções',()=>{
 const p=work('(88) 99234-8066\n@dravictoriadaponte');applyCollection(p,'lumina');const appearance={variant:'solid',color:'#ffffff',badgeColor:'#167d42',badgeOpacity:1};
 const items=contactItems(p.cards[0]);items[0].appearance=appearance;buildContactList(p.cards[0],p.palette,items);
 for(const {id} of COLLECTIONS){applyCollection(p,id);const c=p.cards[0],icon=c.layers.find(l=>l.role==='contactIcon'),badge=c.layers.find(l=>l.role==='contactBadge');assert.equal(icon.iconVariant,'solid');assert.equal(icon.fill,'#ffffff');assert.equal(icon.colorToken,undefined);if(badge){assert.equal(badge.fill,'#167d42');assert.equal(badge.opacity,1);assert.equal(badge.colorToken,undefined);}assert.deepEqual(contactItems(c)[0].appearance,appearance);validateProject(p);}
 composeCard(p.cards[0],p.theme,p.palette);assert.deepEqual(contactItems(p.cards[0])[0].appearance,appearance);validateProject(JSON.parse(JSON.stringify(p)));
});
test('aparência inválida é recusada sem mutação e ícone avulso mantém preenchimento no modelo',()=>{
 for(const bad of [{variant:'gradient'},{color:'red'},{badgeColor:'url(x)'},{badgeOpacity:2},null])assert.throws(()=>validateIconAppearance(bad));
 const p=work('(88) 99234-8066'),c=p.cards[0],before=structuredClone(c);const items=contactItems(c);items[0].appearance={color:'red'};assert.throws(()=>buildContactList(c,p.palette,items));assert.deepEqual(c,before);
 c.layers.push({...iconLayer('camera'),iconVariant:'solid'});const model=captureTemplate(p,c,'Ícone sólido');assert.equal(model.layers.find(l=>l.type==='icon').iconVariant,'solid');
 for(const id of ['whatsapp','camera','phone','location','chat','calendar']){assert.ok(SOLID_ICONS[id]);assert.match(iconSvg(id,'solid'),/fill-rule="(?:evenodd|nonzero)"/);assert.doesNotMatch(iconSvg(id,'solid'),/stroke="currentColor"/);}
});
test('aparências prontas mantêm conteúdo e canal manual, sem mutar antes de aplicar',()=>{
 const p=work('(88) 99234-8066\n@dravictoriadaponte');applyCollection(p,'lumina');let items=contactItems(p.cards[0]);items[0].icon='phone';buildContactList(p.cards[0],p.palette,items);
 for(const preset of ['line','solid','badge']){const before=structuredClone(p),result=contactPreset(p.cards[0],p.palette,preset);assert.deepEqual(p,before);assert.equal(result.items[0].icon,'phone');buildContactList(p.cards[0],p.palette,result.items,result.style);assert.deepEqual(p.cards[0].content,before.cards[0].content);validateProject(p);}
 assert.throws(()=>contactPreset(p.cards[0],p.palette,'invalid'));
});
test('destaque amplia texto e símbolos sem alterar o conteúdo e acompanha a coleção',()=>{
 const p=work('(88) 99234-8066\n@dravictoriadaponte');applyCollection(p,'lumina');const c=p.cards[0],items=contactItems(c),body=c.content.body;
 buildContactList(c,p.palette,items,{...c.contactLayout,contactEmphasis:'regular'});const oldText=c.layers.find(l=>l.role==='contactText').size,oldIcon=c.layers.find(l=>l.role==='contactIcon').w;
 buildContactList(c,p.palette,contactItems(c),{...c.contactLayout,contactEmphasis:'extra'});assert.ok(c.layers.find(l=>l.role==='contactText').size>oldText);assert.ok(c.layers.find(l=>l.role==='contactIcon').w>oldIcon);assert.equal(c.content.body,body);applyCollection(p,'serena');assert.equal(p.cards[0].contactLayout.contactEmphasis,'extra');validateProject(p);
 assert.throws(()=>buildContactList(p.cards[0],p.palette,contactItems(p.cards[0]),{...p.cards[0].contactLayout,contactEmphasis:'invalid'}));
});
