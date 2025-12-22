FROM node:18-slim

# Tell Puppeteer NOT to download its own Chromium (we'll install system Chromium)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production

# Install Chromium + required libs for running headless browser
RUN apt-get update && apt-get install -y \
  chromium \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  wget \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (production only)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Ensure runtime folders exist
RUN mkdir -p tenderData/translated tenderData/eachKeywordTender

# Cloud Run listens on $PORT (we default for local)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]