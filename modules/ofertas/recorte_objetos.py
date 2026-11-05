"""Tira o fundo de fotos que o encarte só traz junto com o fundo (ex.: bandeja de frango sobre fogo).

Usa o modelo U²-Net (o mesmo do rembg) com onnxruntime, só nos produtos que o leitor marca com
'removerfundo'. O modelo (~170 MB) é baixado uma vez para dados/ofertas/modelos e conferido pelo SHA-256.
"""
import hashlib
import io
import threading
import urllib.request

from PIL import Image

from storage import DATA

LOCK = threading.Lock()
SHA = '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491'
URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx'
_sessao = None


def _modelo():
    global _sessao
    if _sessao: return _sessao
    import onnxruntime as ort
    pasta = DATA / 'ofertas' / 'modelos'
    pasta.mkdir(parents=True, exist_ok=True)
    modelo = pasta / 'u2net.onnx'
    if not modelo.exists():
        with urllib.request.urlopen(URL, timeout=120) as r: dados = r.read(200 * 1024 * 1024)
        if hashlib.sha256(dados).hexdigest() != SHA: raise ValueError('Modelo de recorte não corresponde à versão conferida.')
        temp = modelo.with_suffix('.tmp'); temp.write_bytes(dados); temp.replace(modelo)
    elif hashlib.sha256(modelo.read_bytes()).hexdigest() != SHA:
        raise ValueError('Modelo de recorte inválido.')
    opcoes = ort.SessionOptions(); opcoes.intra_op_num_threads = 2
    _sessao = ort.InferenceSession(str(modelo), sess_options=opcoes, providers=['CPUExecutionProvider'])
    return _sessao


def isolar(png):
    """PNG com fundo -> PNG transparente recortado no produto. ValueError se a separação não convencer."""
    import numpy as np
    with LOCK:  # um por vez: o modelo é pesado
        sessao = _modelo()
        im = Image.open(io.BytesIO(png)).convert('RGB')
        arr = np.asarray(im.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32) / 255
        arr = (arr - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
        mask = sessao.run(None, {sessao.get_inputs()[0].name: arr.transpose(2, 0, 1)[None]})[0][0, 0]
    spread = float(mask.max() - mask.min())
    if spread < .001: raise ValueError('Não foi possível separar o produto do fundo.')
    mask = (mask - mask.min()) / spread
    # muita área "em dúvida" = o modelo não separou bem (sachês sobre fundo da mesma cor saíam meio
    # transparentes): melhor manter a foto com fundo e o aviso. Nos encartes conferidos, bons recortes
    # ficam em 5–13% e os ruins acima de 40%
    frente = float((mask > .5).mean())
    if not .03 < frente < .94: raise ValueError('Confira a separação do produto e do fundo.')
    if float(((mask > .1) & (mask < .9)).mean()) > frente * .3: raise ValueError('Separação incerta entre produto e fundo.')
    # máscara firme: produto opaco, fundo transparente, transição só na borda (sem produto "fantasma")
    alpha = Image.fromarray(np.uint8(np.clip((mask - .25) / .5, 0, 1) * 255)).resize(im.size, Image.Resampling.LANCZOS)
    out = im.convert('RGBA'); out.putalpha(alpha)
    caixa = alpha.point(lambda p: 255 if p > 32 else 0).getbbox()
    if caixa: out = out.crop(caixa)
    buffer = io.BytesIO(); out.save(buffer, 'PNG'); return buffer.getvalue()
