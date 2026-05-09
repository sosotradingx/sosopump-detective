# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 4173

ENV NODE_ENV=production

ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]