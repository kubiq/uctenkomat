FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Env is provided at runtime (docker compose env_file), not baked in.
CMD ["node", "src/server.mjs"]
