from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json
root=Path(__file__).resolve().parent.parent
out=root/'test-results/restaurant-workflow'
job=json.loads((out/'native-status.json').read_text(encoding='utf-8'))
assert job['state']=='complete'
results=[]
for i in range(1,4):
    name=f'cartela-{i:02}.png'
    browser=Image.open(root/'.exports'/job['id']/'previas'/name).convert('RGB')
    native=Image.open(Path(job['output'])/name).convert('RGB')
    assert browser.size==native.size==(1280,720)
    difference=sum(ImageStat.Stat(ImageChops.difference(browser,native)).mean)/3
    results.append({'card':i,'meanRgbDifference':round(difference,4)})
    assert difference<3,(i,difference)
(out/'png-comparison.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(results)
