FROM node:20-slim

# Install system dependencies + build tools required for native modules
# (better-sqlite3, sharp need python3/make/g++ to compile from source)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    graphicsmagick \
    webp \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production --legacy-peer-deps --no-audit --no-fund

COPY . .

EXPOSE 5000

CMD ["node", "index.js"]
