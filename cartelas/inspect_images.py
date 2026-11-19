from pypdf import PdfReader
import pypdf.filters as filters
filters.MAX_DECLARED_STREAM_LENGTH=1000000000
r=PdfReader('output/pdf/campanhas de preço para tvs - compactado.pdf')
seen=set()
def walk(res):
 for name,ref in res.get('/XObject',{}).items():
  if ref.idnum in seen: continue
  seen.add(ref.idnum)
  x=ref.get_object()
  if x.get('/Subtype')=='/Image': print(ref.idnum,name,x.get('/Width'),x.get('/Height'),x.get('/Filter'),x.get('/ColorSpace'),len(x._data))
  elif '/Resources' in x: walk(x['/Resources'])
walk(r.pages[0]['/Resources'])
