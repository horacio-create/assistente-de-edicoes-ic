"""Compare browser previews with native Photoshop PNGs; reads generated files only."""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageStat

root = Path(__file__).resolve().parent.parent
out = root / 'test-results' / 'refinement-review'
jobs = json.loads((out / 'native-report.json').read_text(encoding='utf-8'))
results = []
for job in jobs:
    for number in range(1, job['count'] + 1):
        name = f'cartela-{number:02}.png'
        browser = Image.open(root / '.exports' / job['id'] / 'previas' / name).convert('RGB')
        photoshop = Image.open(Path(job['output']) / name).convert('RGB')
        assert browser.size == photoshop.size == (1280, 720)
        mean = sum(ImageStat.Stat(ImageChops.difference(browser, photoshop)).mean) / 3
        results.append({'job': job['id'], 'image': name, 'meanRgbDifference': round(mean, 4)})
        assert mean < 3, f'{job["name"]} / {name}: diferença inesperada {mean}'
(out / 'png-comparison.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'{len(results)} prévias comparadas; diferença média RGB máxima: {max(r["meanRgbDifference"] for r in results)} / 255')
