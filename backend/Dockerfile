# Production image. Development uses Dockerfile.dev (tsx + nodemon, bind mount).

# 1) Dependencies, including dev tools needed to compile
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Compile TypeScript to dist/
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# 3) Runtime: production dependencies + compiled code only, as the non-root "node" user
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && mkdir -p /app/uploads/avatars && chown -R node:node /app/uploads
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Exec form, so SIGTERM reaches Node and the graceful shutdown runs.
CMD ["node", "dist/index.js"]
