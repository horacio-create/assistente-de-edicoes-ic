import json, sys, os, contextlib, socket
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / '.reader-models'

def ocr_engine():
    from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
    return RapidOCR(params={'Global.model_root_dir':str(MODELS/'ocr'), 'Global.log_level':'error',
        'Rec.lang_type':LangRec.LATIN, 'Rec.ocr_version':OCRVersion.PPOCRV5,'Rec.model_type':ModelType.MOBILE,
        'EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':1})

def extract(kind, filename):
    if not (MODELS/'ready.json').exists():
        raise ValueError('Prepare a leitura local antes de enviar áudios ou prints.')
    # Inference has no network access; model installation is a separate explicit step.
    def offline(*args, **kwargs): raise RuntimeError('A leitura local não acessa a internet. Prepare os modelos novamente.')
    socket.socket.connect = offline
    os.environ['HF_HUB_OFFLINE']='1'
    if kind == 'image':
        from PIL import Image, ImageOps
        import numpy as np
        with Image.open(filename) as image:
            if image.width*image.height>32000000 or max(image.size)>12000: raise ValueError('O print é grande demais. Recorte ou reduza a imagem.')
            image=ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((2400,2400))
            array=np.asarray(image)[:,:,::-1].copy()
        result=ocr_engine()(array)
        lines=[]
        if result.txts:
            for text, score, box in zip(result.txts,result.scores,result.boxes):
                lines.append({'text':text,'confidence':round(float(score),3),'y':round(float(box[:,1].mean()),1),'x':round(float(box[:,0].min()),1)})
        # Spatial reading order; close baselines stay left-to-right.
        lines.sort(key=lambda line:(round(line['y']/12),line['x']))
        return {'text':'\n'.join(line['text'] for line in lines),'segments':lines,
            'warnings':['Confira nomes, números e serviços lidos no print.']+(['Há trechos com leitura incerta.'] if any(l['confidence']<.85 for l in lines) else [])}
    if kind=='audio':
        import av
        with av.open(filename) as container:
            if container.duration and container.duration/av.time_base>600: raise ValueError('Use áudios de até 10 minutos.')
        from faster_whisper import WhisperModel
        from faster_whisper.audio import decode_audio
        audio=decode_audio(filename,sampling_rate=16000)
        if len(audio)>600*16000: raise ValueError('Use áudios de até 10 minutos.')
        model=WhisperModel(str(MODELS/'whisper-base'),device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
        segments,info=model.transcribe(audio,language='pt',beam_size=5,vad_filter=True,condition_on_previous_text=False)
        result=[{'text':s.text.strip(),'start':round(s.start,2),'end':round(s.end,2),'uncertain':s.avg_logprob<-1} for s in segments]
        return {'text':'\n'.join(s['text'] for s in result),'segments':result,
            'warnings':['Confira a transcrição, especialmente nomes, telefones e serviços.']+(['Há trechos de áudio com reconhecimento incerto.'] if any(s['uncertain'] for s in result) else [])}
    raise ValueError('Formato de material não suportado.')

if __name__=='__main__':
    try:
        with contextlib.redirect_stdout(sys.stderr): result=extract(sys.argv[1],sys.argv[2])
        if len(result['text'])>50000: raise ValueError('O material contém texto demais. Divida em arquivos menores.')
        print(json.dumps(result,ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'error':str(error)},ensure_ascii=True));sys.exit(1)
