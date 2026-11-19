import {registerFonts,postScriptFont,fontBytes} from './fonts.js';
import { drawCard, drawLayer, makeCanvas, canvasBlob, wrapText, loadImage } from './render.js';

const utf8=new TextEncoder();
export function safeName(s) {return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'trabalho';}
export function download(blob,name) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportCard(card,assets) {const c=makeCanvas();await drawCard(card,assets,c,null,false);download(await canvasBlob(c),safeName(card.label)+'.png');}
export async function sheetBlob(project,direction) {
  const n=project.cards.length;const vertical=direction==='vertical';const gap=24;
  const c=makeCanvas(vertical?1280:n*1280+(n-1)*gap,vertical?n*720+(n-1)*gap:720);
  const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
  for(let i=0;i<n;i++) {const frame=makeCanvas();await drawCard(project.cards[i],project.assets,frame,null,false);ctx.drawImage(frame,vertical?0:i*(1280+gap),vertical?i*(720+gap):0);}
  return canvasBlob(c);
}

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes) {let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function block(size) {const data=new Uint8Array(size);return {data,v:new DataView(data.buffer)};}
// ZIP sem compressão: evita dependências e preserva os PNGs já comprimidos.
export async function zipFiles(files) {
  const output=[],directory=[];let offset=0;
  const now=new Date();const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);const dosDate=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const file of files) {
    const name=utf8.encode(file.name);const data=typeof file.data==='string'?utf8.encode(file.data):file.data instanceof Blob?new Uint8Array(await file.data.arrayBuffer()):file.data;
    const crc=crc32(data);const header=block(30);
    header.v.setUint32(0,0x04034b50,true);header.v.setUint16(4,20,true);header.v.setUint16(6,0x800,true);header.v.setUint16(10,dosTime,true);header.v.setUint16(12,dosDate,true);header.v.setUint32(14,crc,true);header.v.setUint32(18,data.length,true);header.v.setUint32(22,data.length,true);header.v.setUint16(26,name.length,true);
    output.push(header.data,name,data);
    const central=block(46);central.v.setUint32(0,0x02014b50,true);central.v.setUint16(4,20,true);central.v.setUint16(6,20,true);central.v.setUint16(8,0x800,true);central.v.setUint16(12,dosTime,true);central.v.setUint16(14,dosDate,true);central.v.setUint32(16,crc,true);central.v.setUint32(20,data.length,true);central.v.setUint32(24,data.length,true);central.v.setUint16(28,name.length,true);central.v.setUint32(42,offset,true);
    directory.push(central.data,name);offset+=30+name.length+data.length;
  }
  const directorySize=directory.reduce((n,b)=>n+b.length,0);const end=block(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,directorySize,true);end.v.setUint32(16,offset,true);
  return new Blob([...output,...directory,end.data],{type:'application/zip'});
}
const fonts={Arial:['ArialMT','Arial-BoldMT'],Georgia:['Georgia','Georgia-Bold'],Verdana:['Verdana','Verdana-Bold'],'Trebuchet MS':['TrebuchetMS','TrebuchetMS-Bold']};
export function photoshopScript(manifest,{interactive=true,renderPreviews=false}={}) {
  const json=JSON.stringify(manifest).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return `#target photoshop
// Assistente de cartelas: textos nativos; elementos gráficos em camadas PNG.
(function () {
  var spec = ${json};
  var interactive = ${interactive};
  var base = new File($.fileName).parent;
  var oldUnits = app.preferences.rulerUnits;
  var oldTypeUnits = app.preferences.typeUnits;
  var oldDialogs = app.displayDialogs;
  var current = null;
  var originalDocument = app.documents.length ? app.activeDocument : null;
  var result = '';
  function photoQuad() {
    var ref = new ActionReference(); ref.putEnumerated(stringIDToTypeID('layer'), stringIDToTypeID('ordinal'), stringIDToTypeID('targetEnum'));
    var data = executeActionGet(ref).getObjectValue(stringIDToTypeID('smartObjectMore')).getList(stringIDToTypeID('transform'));
    return [data.getDouble(0), data.getDouble(1), data.getDouble(2)-data.getDouble(0), data.getDouble(7)-data.getDouble(1)];
  }
  function photoMask(item) {
    var photo=current.activeLayer,source=app.open(new File(base.fsName+'/'+item.maskFile)),alpha;
    try{alpha=source.channels[0].duplicate(current);}finally{source.close(SaveOptions.DONOTSAVECHANGES);}
    app.activeDocument=current;current.activeLayer=photo;current.selection.load(alpha,SelectionType.REPLACE);current.activeChannels=current.componentChannels;
    var descriptor=new ActionDescriptor(),channel=new ActionReference();
    descriptor.putClass(charIDToTypeID('Nw  '),charIDToTypeID('Chnl'));channel.putEnumerated(charIDToTypeID('Chnl'),charIDToTypeID('Chnl'),charIDToTypeID('Msk '));
    descriptor.putReference(charIDToTypeID('At  '),channel);descriptor.putEnumerated(charIDToTypeID('Usng'),charIDToTypeID('UsrM'),charIDToTypeID('RvlS'));executeAction(charIDToTypeID('Mk  '),descriptor,DialogModes.NO);current.selection.deselect();current.activeChannels=current.componentChannels;alpha.remove();
    var settings=new ActionDescriptor(),target=new ActionReference(),values=new ActionDescriptor();target.putEnumerated(stringIDToTypeID('layer'),stringIDToTypeID('ordinal'),stringIDToTypeID('targetEnum'));settings.putReference(charIDToTypeID('null'),target);values.putBoolean(stringIDToTypeID('userMaskLinked'),false);settings.putObject(charIDToTypeID('T   '),stringIDToTypeID('layer'),values);executeAction(charIDToTypeID('setd'),settings,DialogModes.NO);
  }
  function placePhoto(item) {
    var descriptor=new ActionDescriptor();descriptor.putPath(charIDToTypeID('null'),new File(base.fsName+'/'+item.file));
    descriptor.putEnumerated(charIDToTypeID('FTcs'),charIDToTypeID('QCSt'),charIDToTypeID('Qcsa'));executeAction(charIDToTypeID('Plc '),descriptor,DialogModes.NO);
    var layer=current.activeLayer,quad=photoQuad();layer.resize(item.image.w/quad[2]*100,item.image.h/quad[3]*100,AnchorPosition.TOPLEFT);
    quad=photoQuad();layer.translate(item.image.x-quad[0],item.image.y-quad[1]);photoMask(item);layer.opacity=item.opacity*100;return layer;
  }
  try {
    var required = {}, missing = [];
    for (var c = 0; c < spec.cards.length; c++) for (var i = 0; i < spec.cards[c].layers.length; i++) {
      var candidate = spec.cards[c].layers[i];
      if (candidate.type === 'text') required[candidate.psFont] = true;
      else {if (!(new File(base.fsName + '/' + candidate.file)).exists) throw new Error('Material ausente: ' + candidate.file + '. Extraia o ZIP completo antes de executar.');if(candidate.type==='photo'&&!(new File(base.fsName+'/'+candidate.maskFile)).exists)throw new Error('Máscara ausente: '+candidate.maskFile);}
    }
    for (var font in required) { try { app.fonts.getByName(font); } catch (e) { missing.push(font); } }
    if (missing.length) throw new Error('Instale estas fontes ou altere a tipografia no aplicativo: ' + missing.join(', '));
    var output = new Folder(base.fsName + '/PSDs');
    if (!output.exists && !output.create()) throw new Error('Não foi possível criar a pasta PSDs.');
    output = new Folder(output.fsName + '/entrega-' + new Date().getTime());
    if (!output.create()) throw new Error('Não foi possível criar a pasta desta entrega.');
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.PIXELS;
    app.displayDialogs = DialogModes.NO;
    current = app.documents.add(1280, 720, 72, 'Cartelas', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    var initial = current.layers[0], groups = [];
    for (var c = 0; c < spec.cards.length; c++) {
      var card = spec.cards[c];
      if(c>0)groups[c-1].visible=false;
      var group = current.layerSets.add(); group.name=card.name; group.blendMode=BlendMode.NORMAL;
      if(c>0)group.move(groups[c-1],ElementPlacement.PLACEAFTER);
      groups.push(group); current.activeLayer=group;
      for (var i = 0; i < card.layers.length; i++) {
        var item = card.layers[i], layer;
        if (item.type === 'text') {
          layer = current.artLayers.add(); layer.kind = LayerKind.TEXT;
          var text = layer.textItem; text.kind = TextType.POINTTEXT;
          text.contents = item.lines.join('\\r'); text.font = item.psFont; text.size = item.size;
          text.useAutoLeading = false; text.leading = item.leading;
          text.justification = item.align === 'center' ? Justification.CENTER : item.align === 'right' ? Justification.RIGHT : Justification.LEFT;
          text.position = [item.anchorX, item.baseline];
          var color = new SolidColor(); color.rgb.hexValue = item.fill.substr(1); text.color = color;
          text.antiAliasMethod = AntiAlias.SHARP;
          layer.opacity = item.opacity * 100;
        } else if(item.type === 'photo') {
          layer = placePhoto(item);
        } else {
          var source = app.open(new File(base.fsName + '/' + item.file));
          try { layer = source.activeLayer.duplicate(current, ElementPlacement.PLACEATBEGINNING); }
          finally { source.close(SaveOptions.DONOTSAVECHANGES); }
          app.activeDocument = current;
        }
        layer.name = item.name; layer.visible = true;
        layer.move(group,ElementPlacement.INSIDE);
        if (item.locked) layer.allLocked = true;
      }
      ${renderPreviews?"var previewOptions = new PNGSaveOptions(); current.saveAs(new File(output.fsName + '/' + card.filename + '.png'), previewOptions, true, Extension.LOWERCASE);":''}
    }
    initial.remove();
    for(var c=0;c<groups.length;c++)groups[c].visible=c===0;
    current.activeLayer=groups[0];
    var options = new PhotoshopSaveOptions(); options.layers = true; options.embedColorProfile = true;
    current.saveAs(new File(output.fsName + '/cartelas.psd'), options, true, Extension.LOWERCASE);
    current.close(SaveOptions.DONOTSAVECHANGES); current = null;
    result = 'OK|' + output.fsName + '|' + spec.cards.length;
    if (interactive) alert('Cartelas criadas em:\\n' + output.fsName + '\\nConfira a aparência e a edição dos textos antes de usar na produção.');
  } catch (error) {
    if (current) { try { current.close(SaveOptions.DONOTSAVECHANGES); } catch (ignored) {} }
    result = 'ERROR|' + error.message;
    if (interactive) alert('A montagem não foi concluída: ' + error.message);
  } finally {
    app.preferences.rulerUnits = oldUnits; app.preferences.typeUnits = oldTypeUnits; app.displayDialogs = oldDialogs;
    if (originalDocument) { try { app.activeDocument = originalDocument; } catch (ignored) {} }
  }
  var report = new File(base.fsName + '/resultado-photoshop.txt'); report.encoding = 'UTF-8';
  if (report.open('w')) { report.write(result); report.close(); }
  return result;
}());
`;
}
export async function photoshopMaterials(project) {
  await registerFonts(project.fonts||[]);
  const files=[],photos=new Map();const manifest={version:1,delivery:'grouped',cards:[],customFonts:(project.fonts||[]).map(({psName})=>psName)};
  for(let i=0;i<project.cards.length;i++) {
    const card=project.cards[i], folder=`cartela-${String(i+1).padStart(2,'0')}`;
    const entry={name:card.label,filename:folder,layers:[]};
    for(let j=0;j<card.layers.length;j++) {
      const l=card.layers[j];if(!l.visible)continue;
      if(l.type==='text') {
        const ctx=makeCanvas().getContext('2d');const m=wrapText(ctx,l);
        entry.layers.push({...l,lines:m.lines,psFont:postScriptFont(l.font,l.weight,project.fonts||[]),leading:l.size*l.lineHeight,anchorX:l.align==='center'?l.x+l.w/2:l.align==='right'?l.x+l.w:l.x,baseline:l.y+m.ascent});
      } else if(l.type==='image'&&l.role==='photo'&&l.assetId){
        const im=await loadImage(project.assets[l.assetId]);let source=photos.get(l.assetId);
        if(!source){const ratio=Math.min(1,4096/Math.max(im.width,im.height));const canvas=makeCanvas(Math.max(1,Math.round(im.width*ratio)),Math.max(1,Math.round(im.height*ratio)));canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);source={file:`materiais/foto-${String(photos.size+1).padStart(2,'0')}.png`,width:canvas.width,height:canvas.height};photos.set(l.assetId,source);files.push({name:source.file,data:await canvasBlob(canvas)});}
        const scale=(l.fit==='contain'?Math.min(l.w/im.width,l.h/im.height):Math.max(l.w/im.width,l.h/im.height))*l.zoom;
        const maskFile=`camadas/${folder}/${String(j+1).padStart(2,'0')}-mascara-foto.png`,maskCanvas=makeCanvas(),maskCtx=maskCanvas.getContext('2d');maskCtx.fillStyle='#000000';maskCtx.fillRect(0,0,1280,720);await drawLayer(maskCtx,{...l,type:'shape',fill:'#ffffff',opacity:1,gradient:undefined,texture:undefined,shadow:undefined},project.assets,false);files.push({name:maskFile,data:await canvasBlob(maskCanvas)});
        entry.layers.push({name:l.name,type:'photo',file:source.file,maskFile,locked:l.locked,opacity:l.opacity,sourceWidth:source.width,sourceHeight:source.height,image:{x:l.x+(l.w-im.width*scale)/2+l.offsetX,y:l.y+(l.h-im.height*scale)/2+l.offsetY,w:im.width*scale,h:im.height*scale},mask:{x:l.x,y:l.y,w:l.w,h:l.h,corners:(l.corners||Array(4).fill(l.radius||0)).map(v=>Math.min(v,l.w/2,l.h/2))}});
      } else {
        if(l.type==='image'&&!l.assetId)continue;
        const c=makeCanvas();await drawLayer(c.getContext('2d'),l,project.assets,false);
        const file=`camadas/${folder}/${String(j+1).padStart(2,'0')}-${safeName(l.name)}.png`;
        files.push({name:file,data:await canvasBlob(c)});entry.layers.push({name:l.name,type:'raster',file,locked:l.locked});
      }
    }
    const preview=makeCanvas();await drawCard(card,project.assets,preview,null,false);
    files.push({name:`previas/${folder}.png`,data:await canvasBlob(preview)});manifest.cards.push(entry);
  }
  return {files,manifest};
}
export async function photoshopPackage(project) {
  const {files,manifest}=await photoshopMaterials(project);
  for(const font of project.fonts||[])files.push({name:`Fontes/${font.id.slice(5,17)}-${font.psName}.${font.format}`,data:fontBytes(font)});
  files.push({name:'montar-cartelas.jsx',data:photoshopScript(manifest)});
  files.push({name:'composicao.json',data:JSON.stringify(manifest,null,2)});
  files.push({name:'projeto.cartelas.json',data:JSON.stringify(project)});
  files.push({name:'LEIA-ME.txt',data:'1. Extraia este ZIP inteiro.\n2. No Photoshop: Arquivo > Scripts > Procurar. Selecione montar-cartelas.jsx.\n3. Um arquivo cartelas.psd é criado em PSDs/entrega-[data]. Cada cartela fica em um grupo, no mesmo documento de 1280 × 720. Alterne a visibilidade dos grupos para trabalhar em cada cena.\n\nTextos são camadas nativas editáveis. Fotografias são objetos inteligentes incorporados com máscaras de camada independentes. Fotos maiores que 4096 pixels são reduzidas para esse limite no arquivo incorporado. Clique na miniatura da foto para mover o conteúdo, ou na máscara para ajustar o recorte. Formas, logo, ícones e QR permanecem rasterizados em camadas separadas. O projeto JSON preserva as imagens originais e a geometria para edição no aplicativo.\n\nO QR Code é uma imagem pronta enviada pelo cliente. Seu conteúdo não é recriado nem alterado pelo sistema.\n\nConfira a aparência final no seu Photoshop. Instale as fontes utilizadas antes de executar.\n'});
  return zipFiles(files);
}
export async function nativePhotoshopPayload(project) {
  const {files,manifest}=await photoshopMaterials(project);
  const images=await Promise.all(files.map(async file=>({name:file.name,data:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível preparar a imagem.'));reader.readAsDataURL(file.data);})})));
  return {manifest,images,name:project.name};
}
