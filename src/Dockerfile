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
COPY --from=builder /app/functions ./functions
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV NODE_ENV=production

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]