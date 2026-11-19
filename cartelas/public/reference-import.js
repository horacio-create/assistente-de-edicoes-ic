export async function prepareReferenceFile(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Use PNG, JPG ou WebP de até 8 MB.');
  const bitmap=await createImageBitmap(file);try{
    if(bitmap.width*bitmap.height>32000000||bitmap.width>20000||bitmap.height>20000)throw Error('Use imagens de até 32 megapixels e 20 mil pixels por lado.');
    const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');if(data.length>2500000)throw Error('Reduza a resolução da referência.');return {data,name:file.name,included:true,crop:null};
  }finally{bitmap.close();}
}
