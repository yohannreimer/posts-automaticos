FROM node:22-bookworm-slim

WORKDIR /app

# ffmpeg (composição de vídeo) + toolchain pra compilar o whisper.cpp
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates git build-essential cmake \
    && rm -rf /var/lib/apt/lists/*

# whisper.cpp (transcrição local, grátis)
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/whisper.cpp/build -j --config Release \
    && cp /tmp/whisper.cpp/build/bin/whisper-cli /usr/local/bin/ \
    && cp /tmp/whisper.cpp/build/src/libwhisper.so* /usr/local/lib/ 2>/dev/null; \
       cp /tmp/whisper.cpp/build/ggml/src/libggml*.so /usr/local/lib/ 2>/dev/null; \
       ldconfig \
    && rm -rf /tmp/whisper.cpp

# Modelo de transcrição (large-v3-turbo quantizado, ótimo em português)
RUN mkdir -p /app/assets/models \
    && curl -fsSL -o /app/assets/models/ggml-large-v3-turbo-q5_0.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin

# Dependências Node (camada cacheada entre builds)
COPY package*.json ./
RUN npm ci --omit=dev

# Chromium do Playwright + bibliotecas de sistema que ele precisa
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV WHISPER_BIN=whisper-cli
ENV WHISPER_MODEL=/app/assets/models/ggml-large-v3-turbo-q5_0.bin
EXPOSE 4173

CMD ["node", "server.mjs"]
