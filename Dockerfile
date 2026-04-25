FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js runner.js ./

EXPOSE 3000

CMD ["node", "server.js"]
