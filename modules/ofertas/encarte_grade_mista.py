"""Associação por oferta para páginas densas com grades e destaques independentes."""
import re
import pymupdf


def extrair_grade(page,doc,selos,objetos,imagens,spans,caracteres,precos_selo,numero):
    from .encarte import _foto,_unidade,avisos,_complemento,_tokens_preco
    centro=lambda r:(r.tl+r.br)/2
    alturas=sorted(s[0].height for s in selos)
    altura=alturas[len(alturas)//2]
    candidatos=[s for s in spans if max(4,altura*.1)<s[2]<altura*.42
                and re.search('[A-Za-zÀ-ú]',s[1]) and '$' not in s[1]
                and not re.fullmatch(r'cada|kg|un|100g|CLUBE DE DESCONTO',s[1],re.I)
                and not any(r[0].contains(centro(s[0])) for r in selos)]
    grupos=[]
    for s in sorted(candidatos,key=lambda s:(s[0].y0,s[0].x0)):
        op=[g for g in grupos if abs(g['size']-s[2])<.5
            and -2<s[0].y0-g['last'].y1<s[2]*.8
            and min(g['rect'].x1,s[0].x1)-max(g['rect'].x0,s[0].x0)>min(g['rect'].width,s[0].width)*.3]
        if op:
            g=min(op,key=lambda g:abs(centro(g['rect']).x-centro(s[0]).x))
            g['rect']|=s[0];g['last']=s[0];g['text']+=' '+s[1]
        else:grupos.append(dict(rect=pymupdf.Rect(s[0]),last=s[0],size=s[2],text=s[1]))
    def distancia_titulo(g,r):
        t=g['rect']
        lateral=t.x1<=r.x0+5 and 0<=r.x0-t.x1<r.width and abs(centro(t).y-centro(r).y)<r.height
        if t.y0>r.y0 and not lateral:return float('inf')
        dx=abs(centro(t).x-(centro(r).x-r.width*.3))/r.width
        dy=max(0,r.y0-t.y1)/r.height
        return dx*dx*5+dy*.35
    pares=sorted((distancia_titulo(g,s[0]),i,j) for i,s in enumerate(selos) for j,g in enumerate(grupos))
    usados=set();titulos={}
    for distancia,i,j in pares:
        if i not in titulos and j not in usados and distancia<8:
            titulos[i]=grupos[j];usados.add(j)
    fotos={i:[] for i in range(len(selos))}
    ids_selos={s[1] for s in selos}
    # Uma foto situada abaixo dos selos dentro de uma arte composta não pertence
    # ao produto da linha seguinte. Essa região será recortada da própria arte.
    fundos_compostos=[]
    for im in imagens:
        if im[1] in ids_selos or im[0].get_area()>=page.rect.get_area()*.25 or im[0].width<altura*3 or im[0].height<altura*2:continue
        contidos=[s[0] for s in selos if im[0].contains(centro(s[0]))]
        if 0<len(contidos)<=2 and im[0].y1>max(r.y1 for r in contidos)+altura*.5:
            fundos_compostos.append((im[0],max(r.y1 for r in contidos)))
    for im in objetos:
        if any(f.contains(centro(im[0])) and centro(im[0]).y>fim for f,fim in fundos_compostos):continue
        op=[]
        for i,selo in enumerate(selos):
            r=selo[0]
            if im[0].y0>=r.y1 or im[0].y1>r.y1+r.height*.8:continue
            if r.y0-im[0].y1>r.height*2:continue
            titulo=titulos.get(i)
            if titulo and titulo['rect'].y1<r.y0-r.height*.5 and im[0].y1<titulo['rect'].y0-r.height*.4:continue
            alvo=centro(r).x-r.width*.4
            dx=max(im[0].x0-alvo,0,alvo-im[0].x1)/r.width
            dy=max(0,r.y0-im[0].y1)/r.height
            dc=abs(centro(im[0]).x-alvo)/r.width
            op.append((dx*dx*5+dy*dy+dc*.1,i))
        if op:
            distancia,i=min(op)
            if distancia<4:fotos[i].append(im)
    ids_selos={s[1] for s in selos}
    resultado=[]
    for i,selo in enumerate(selos):
        r=selo[0];titulo=titulos.get(i);partes=fotos[i]
        if not titulo:raise ValueError('Não foi possível identificar o título de uma oferta. Marque essa oferta na página.')
        nome=titulo['text'];principal=precos_selo[id(selo)]
        extra,caixa_extra=_complemento(spans,principal[0])
        faixa=pymupdf.Rect(r.x0-r.width*.9,r.y0-r.height*.8,r.x1,r.y1+r.height*.7)
        normais=[c for c in caracteres if faixa.contains(centro(c[0]))
                 and not any(s[0].contains(centro(c[0])) for s in selos)
                 and (not caixa_extra or not caixa_extra.contains(centro(c[0])))]
        tokens=[t for t in _tokens_preco(spans) if faixa.contains(centro(t[0]))
                and not any(s[0].contains(centro(t[0])) for s in selos)
                and not (t[0].y0>r.y1 and t[0].x0>=r.x0)
                and (not caixa_extra or not caixa_extra.intersects(t[0]))]
        normal=min(tokens,key=lambda t:(max(r.x0-t[0].x1,0)+abs(t[0].y0-r.y0)*.5)/max(1,t[2])**2) if tokens else numero(normais)
        unidades=[s for s in spans if r.contains(centro(s[0])) and re.fullmatch(r'KG|CADA|UN|100g',s[1],re.I)]
        unidade=_unidade(unidades,principal[0]).upper()
        if unidade=='100G':unidade='100g'
        por,de=principal[1],normal[1] if normal else ''
        notas=avisos(nome,por,de,unidade)
        area=pymupdf.Rect(r)|titulo['rect']
        if partes:
            png=_foto(doc,partes)
            for im in partes:area|=im[0]
        else:
            # Algumas artes trazem produto e fundo unidos em uma única imagem.
            # Recorta só a região da foto abaixo do preço, sem incluir o selo.
            fundos=[im for im in imagens if im[1] not in ids_selos and im[0].contains(centro(r))
                    and im[0].y1>r.y1+r.height*.5 and im[0].get_area()<page.rect.get_area()*.25]
            if not fundos:raise ValueError(f'Não foi possível isolar a foto de {nome}. Marque essa oferta na página.')
            fundo=min(fundos,key=lambda im:im[0].get_area())[0]
            vizinhos=sorted([s[0] for s in selos if fundo.contains(centro(s[0])) and abs(s[0].y0-r.y0)<r.height],key=lambda s:s.x0)
            pos=vizinhos.index(r)
            esquerda=fundo.x0+2 if pos==0 else (vizinhos[pos-1].x1+r.x0)/2
            direita=fundo.x1-2 if pos==len(vizinhos)-1 else (r.x1+vizinhos[pos+1].x0)/2
            recorte=pymupdf.Rect(esquerda,max(s.y1 for s in vizinhos)+3,direita,fundo.y1-2)
            if recorte.is_empty or recorte.height<15:raise ValueError(f'Confira o recorte de {nome} na página.')
            png=page.get_pixmap(matrix=pymupdf.Matrix(3,3),clip=recorte,alpha=False).tobytes('png')
            area|=recorte
            notas.append('Foto unida ao fundo na arte: confira o recorte e troque a imagem se necessário')
        extra,caixa_extra=_complemento(spans,principal[0])
        if caixa_extra:area|=caixa_extra
        resultado.append({'nome':nome,'por':por,'de':de,'unidade':unidade,**extra,
                          'avisos':notas,'pagina':page.number+1,'area':[round(v,1) for v in area],'png':png})
    return sorted(resultado,key=lambda it:(round(it['area'][1]/70),it['area'][0]))
