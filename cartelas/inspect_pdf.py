from pypdf import PdfReader
import pypdf.generic._data_structures as ds
ds.MAX_STREAM_LENGTH=1000000000
p=r'Z:/Clientes IC/Fortaleza/SD Mais/Outubro 2026/Promoção - Cerveja Stella (Posto Modelo)/OFF/campanhas de preço para tvs.pdf'
r=PdfReader(p)
print([n for n in dir(ds) if n.startswith('MAX')])
print('catalog',list(r.trailer['/Root'].keys()))
for page in r.pages:
 print('page keys',list(page.keys()))
 for name,ref in page['/Resources'].get('/XObject',{}).items():
  obj=ref.get_object()
  print(name, {k:str(v)[:200] for k,v in obj.items() if k not in ['/SMask','/Metadata']},'bytes',len(obj._data))
