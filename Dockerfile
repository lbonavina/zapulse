FROM node:20-alpine

# Dependências nativas necessárias pelo Baileys/libsignal
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copia apenas o package.json primeiro (cache de layers)
COPY package.json ./
RUN npm install --omit=dev

# Copia o restante do código
COPY . .

# Cria a pasta de sessão (montada como volume em produção)
RUN mkdir -p auth

EXPOSE 3000

CMD ["node", "src/index.js"]
