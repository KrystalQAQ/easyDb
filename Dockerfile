FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend-app
RUN npm config set registry https://registry.npmmirror.com \
  && npm install -g pnpm@10.30.3 \
  && pnpm config set registry https://registry.npmmirror.com

COPY frontend-app/package.json frontend-app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend-app/ ./
RUN pnpm build

FROM node:20-alpine AS backend-builder

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com \
  && npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY docs ./docs
COPY runtime ./runtime
COPY frontend-demo ./frontend-demo
COPY deploy ./deploy
COPY skills ./skills
COPY README.md ./
COPY .env.example ./
COPY deploy-cli.sh stop-cli.sh ./

COPY --from=frontend-builder /app/frontend-app/dist ./frontend-app/dist

FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache nginx \
  && rm -f /etc/nginx/http.d/default.conf /etc/nginx/conf.d/default.conf

COPY --from=backend-builder /app /app
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/start-single.sh /app/docker/start-single.sh

RUN chmod +x /app/docker/start-single.sh \
  && mkdir -p /app/runtime/nginx/conf.d /app/runtime/project-web /app/logs

ENV NODE_ENV=production
EXPOSE 80

CMD ["/app/docker/start-single.sh"]
