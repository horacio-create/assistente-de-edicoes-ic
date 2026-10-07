# Assistente de Edições (web) + módulo Ofertas de supermercados — imagem para servidor Linux.
# Python (toolkit) + Node 22 (motor HyperFrames) + FFmpeg + Chrome headless para gerar os vídeos.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    INDOOR_DATA=/dados INDOOR_HOST=0.0.0.0 INDOOR_PORT=8080

# FFmpeg e bibliotecas de sistema do Chrome headless; Node 22 pelo repositório oficial (NodeSource)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg unzip ffmpeg fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
      libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
      libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# usuário sem privilégios; o Chrome do HyperFrames fica no cache dele
RUN useradd -m -u 10001 indoor && mkdir -p /dados /exportacoes && chown -R indoor /app /dados /exportacoes
USER indoor
COPY --chown=indoor ofertas/motor/package.json ofertas/motor/package-lock.json ofertas/motor/
RUN cd ofertas/motor && npm ci --no-audit --no-fund \
 && node node_modules/hyperframes/bin/hyperframes.mjs browser ensure

COPY --chown=indoor . .
EXPOSE 8080
CMD ["python", "server.py"]
