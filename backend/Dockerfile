FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN ./node_modules/.bin/prisma generate

COPY . .

RUN npm run build && rm -f dist/prisma/seed-demo.js

FROM node:20-alpine AS prod-deps

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json ./
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

EXPOSE 5000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
