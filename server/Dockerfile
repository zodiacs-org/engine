# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f server/Dockerfile -t zodiacs-engine-http .
FROM node:22.23.3-bookworm-slim AS base
WORKDIR /app/server

FROM base AS build
COPY server/package.json server/package-lock.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/scripts/build.mjs ./scripts/build.mjs
COPY server/src/ ./src/
# Bundle public engine source imports without installing or building the root package.
COPY package.json /app/package.json
COPY src/ /app/src/
RUN npm run build

FROM base AS production-dependencies
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY server/package.json ./
COPY --from=production-dependencies /app/server/node_modules/ ./node_modules/
COPY --from=build /app/server/build/main.js /app/server/build/calculation-worker.js ./build/
COPY server/scripts/healthcheck.mjs ./scripts/healthcheck.mjs
# Keep engine attribution alongside the bundled code and dependency notices in node_modules.
COPY LICENSE LICENSING.md NOTICE /app/licenses/engine/
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]
ENTRYPOINT ["node"]
CMD ["build/main.js"]
