import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=new URL('../test-results/photoshop-native/',import.meta.url);
const report=await readFile(new URL('resultado-photoshop.txt',base),'utf8');
const folder=report.replace(/^\uFEFF/,'').split('|')[1];
const manifest=JSON.parse(await readFile(new URL('composicao.json',base),'utf8'));
const photo=fileURLToPath(new URL('../tests/fixtures/logo.png',import.meta.url)).replaceAll('\\','/');
const jsx=`#target photoshop
(function () {
  var spec=${JSON.stringify(manifest)}, folder=${JSON.stringify(folder)}, replacementFile=${JSON.stringify(photo)};
  var original=app.documents.length?app.activeDocument:null, countBefore=app.documents.length, current=null, textCount=0, edited=false, replaced=false, result='';
  var units=app.preferences.rulerUnits, dialogs=app.displayDialogs;
  try {
    app.preferences.rulerUnits=Units.PIXELS; app.displayDialogs=DialogModes.NO;
    for(var c=0;c<spec.cards.length;c++) {
      current=app.open(new File(folder+'/'+spec.cards[c].filename+'.psd'));
      if(current.width.as('px')!==1280||current.height.as('px')!==720)throw new Error('Dimensoes incorretas');
      if(current.layers.length!==spec.cards[c].layers.length)throw new Error('Numero incorreto de camadas');
      for(var i=0;i<spec.cards[c].layers.length;i++) {
        var item=spec.cards[c].layers[i], layer=current.layers.getByName(item.name);
        if(item.type==='text') {
          if(layer.kind!==LayerKind.TEXT)throw new Error('Texto rasterizado');
          if(layer.textItem.contents!==item.lines.join('\\r'))throw new Error('Conteudo de texto alterado');
          if(layer.textItem.font!==item.psFont)throw new Error('Fonte substituida');
          textCount++;
        }
      }
      if(c===0) {
        var title=current.layers.getByName('Título');title.textItem.contents='TEXTO EDITADO NO PHOTOSHOP';
        var oldPhoto=current.layers.getByName('Foto'), source=app.open(new File(replacementFile)), replacement;
        try {replacement=source.activeLayer.duplicate(current,ElementPlacement.PLACEATBEGINNING);}finally{source.close(SaveOptions.DONOTSAVECHANGES);}
        app.activeDocument=current;replacement.name='Foto substituida no teste';replacement.move(oldPhoto,ElementPlacement.PLACEBEFORE);oldPhoto.remove();
        var options=new PhotoshopSaveOptions();options.layers=true;
        current.saveAs(new File(folder+'/edicao-texto-e-foto.psd'),options,true,Extension.LOWERCASE);
        current.close(SaveOptions.DONOTSAVECHANGES);current=app.open(new File(folder+'/edicao-texto-e-foto.psd'));
        edited=current.layers.getByName('Título').textItem.contents==='TEXTO EDITADO NO PHOTOSHOP';
        replaced=current.layers.getByName('Foto substituida no teste').kind===LayerKind.NORMAL;
        if(!edited||!replaced)throw new Error('Edicao nao persistiu');
      }
      current.close(SaveOptions.DONOTSAVECHANGES);current=null;
    }
    if(app.documents.length!==countBefore)throw new Error('Documentos abertos divergentes');
    result='OK|cards='+spec.cards.length+'|textLayers='+textCount+'|editText='+edited+'|replacePhoto='+replaced+'|userDocumentsPreserved=true';
  } catch(e) {result='ERROR|'+e.message;}
  finally {if(current){try{current.close(SaveOptions.DONOTSAVECHANGES);}catch(ignored){}}app.preferences.rulerUnits=units;app.displayDialogs=dialogs;if(original){try{app.activeDocument=original;}catch(ignored){}}}
  var file=new File(new File($.fileName).parent.fsName+'/auditoria-photoshop.txt');file.encoding='UTF-8';file.open('w');file.write(result);file.close();return result;
}());`;
await writeFile(new URL('auditar-psds.jsx',base),jsx,'utf8');
