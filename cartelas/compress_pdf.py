from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
import pypdf.filters as filters
filters.MAX_DECLARED_STREAM_LENGTH=1000000000
src=Path(r'Z:/Clientes IC/Fortaleza/SD Mais/Outubro 2026/Promoção - Cerveja Stella (Posto Modelo)/OFF/campanhas de preço para tvs.pdf')
out=Path('output/pdf/campanhas de preço para tvs - compactado.pdf')
out.parent.mkdir(parents=True,exist_ok=True)
r=PdfReader(src)
w=PdfWriter()
for p in r.pages:
 for k in ['/PieceInfo','/Thumb','/Metadata']:
  p.pop(k,None)
 w.add_page(p)
if '/OCProperties' in r.trailer['/Root']:
 w._root_object.update({NameObject('/OCProperties'):r.trailer['/Root']['/OCProperties'].clone(w)})
w.write(out)
print('ORIGINAL',src.stat().st_size,'OUTPUT',out.stat().st_size,flush=True)

