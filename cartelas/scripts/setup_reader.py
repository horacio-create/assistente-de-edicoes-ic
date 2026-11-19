import json,sys
from pathlib import Path
from reader_worker import ocr_engine,MODELS
from faster_whisper.utils import download_model
MODELS.mkdir(parents=True,exist_ok=True)
(MODELS/'ready.json').unlink(missing_ok=True)
print('Preparando modelos de leitura de prints...',flush=True)
engine=ocr_engine()
engine._load_det_model()
engine._load_cls_model()
engine._load_rec_model()
print('Preparando modelo de audio em portugues...',flush=True)
download_model('base',output_dir=str(MODELS/'whisper-base'))
(MODELS/'ready.json').write_text(json.dumps({'audio':'whisper-base','ocr':'latin-ppocrv5','version':1}),encoding='utf-8')
print('Leitura local preparada. Os materiais serao processados no computador.',flush=True)
