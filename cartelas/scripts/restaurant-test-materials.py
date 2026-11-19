from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path('Exemplos/Restaurante-Mangai-Teste')
out.mkdir(parents=True, exist_ok=True)
font = lambda size, bold=False: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', size)
messages = [
 ('print-1-pedido.png', 'Pedido de VT', [
  'Cliente: MANGAI', 'Área: COZINHA BRASILEIRA', '',
  'Serviços:', '• Baião de dois', '• Carne de sol', '• Sobremesas regionais', '',
  'Vamos enviar logo e duas fotos dos pratos.',
  'Queremos três cartelas para TV, em 1280 x 720.',
  'Cores: verde escuro, creme e dourado.']),
 ('print-2-contatos.png', 'Encerramento e contatos de teste', [
  'Chamada: Sabores que acolhem', '',
  'Telefone: (00) 90000-0000',
  'Instagram: @restaurante_teste', '',
  'Não precisamos de QR Code neste trabalho.',
  'Na última cartela, destacar WhatsApp e Instagram.',
  'Não incluir preços nem horários.'])
]
for filename, title, lines in messages:
    im = Image.new('RGB', (1400, 1250), '#edf2eb'); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1400, 160), fill='#163d30')
    d.text((40, 27), 'SIMULAÇÃO DE TESTE — NÃO É CONVERSA REAL', font=font(36, True), fill='white')
    d.text((40, 90), 'Referência: Mangai | ' + title, font=font(30), fill='white')
    d.rounded_rectangle((30, 190, 1370, 1160), 24, fill='white')
    for i, line in enumerate(lines):
        d.text((60, 225 + i * 74), line, font=font(33), fill='#26352c')
    d.text((40, 1200), 'Pedido, contatos e oferta fictícios. Sem vínculo com o restaurante.', font=font(25), fill='#54685c')
    im.save(out / filename)

# A test wordmark, expressly not the restaurant's official logo.
im = Image.new('RGBA', (1000, 360)); d = ImageDraw.Draw(im)
d.text((65, 30), 'MANGAI', font=font(160, True), fill='#d8b76f')
d.text((75, 218), 'COZINHA BRASILEIRA', font=font(40), fill='#d8b76f')
d.text((75, 292), 'SIMULAÇÃO · MARCA ILUSTRATIVA', font=font(25), fill='#d8b76f')
im.save(out / 'logo-ilustrativo.png')
(out / 'mensagem-do-audio.txt').write_text('Este é um pedido simulado para testar o sistema. O nome do cliente é Mangai, restaurante de cozinha brasileira. Vamos enviar o logo e duas fotos dos pratos. Queremos três cartelas, uma de apresentação, uma com os pratos e a última com os contatos. Usem verde escuro, creme e dourado. A chamada final é: Sabores que acolhem. Neste trabalho não queremos código QR. Destaquem o WhatsApp e o Instagram na última cartela. Os contatos de teste estão no print. Não coloquem preços nem horários. Obrigado.', encoding='utf-8')
(out / 'LEIA-ME.txt').write_text('TESTE COMPLETO DE RESTAURANTE\n\nReferência pública de segmento: Mangai, cozinha brasileira. Fonte: https://linktr.ee/mangairestaurante (consultada em 16/10/2026).\n\nEste NÃO é um pedido real do restaurante. Os prints, áudio sintetizado Microsoft Maria, contatos, pratos/oferta e identidade aplicada são SIMULAÇÕES para teste. O wordmark não é o logo oficial. As fotos são ilustrações geradas por IA, não fotografias de produtos do restaurante. Nenhuma mensagem foi enviada ao restaurante. A aprovação é simulada e interna.\n\nObjetivo: leitura local real de 2 prints e 1 áudio; revisão do briefing; roteiro de 3 cartelas; importação múltipla; template À mesa; contatos grandes; ausência de QR; aprovação em imagem; PSD único com grupos e cópia reaberta.\n', encoding='utf-8')
print(out.resolve())
