from pathlib import Path
from reportlab.pdfgen import canvas
from pypdf import PdfReader
from PIL import Image
out=Path('output/pdf/campanhas de preço para tvs - compactado.pdf')
img=Path('output/pdf/tv-4k.jpg')
assert Image.open(img).size==(3840,2160)
c=canvas.Canvas(str(out),pagesize=(3840,2160),pageCompression=1)
c.setTitle('Campanhas de preço para TVs - compactado')
c.drawImage(str(img),0,0,width=3840,height=2160)
c.showPage()
c.save()
r=PdfReader(out)
assert len(r.pages)==1
print('OUTPUT_BYTES',out.stat().st_size,'PAGES',len(r.pages),'IMAGE',Image.open(img).size)
