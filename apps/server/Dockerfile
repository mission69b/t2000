FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/sdk/package.json packages/sdk/
COPY packages/mpp-sui/package.json packages/mpp-sui/
COPY patches/ patches/

RUN pnpm install --frozen-lockfile

COPY packages/sdk packages/sdk/
COPY packages/mpp-sui packages/mpp-sui/
COPY apps/server apps/server/
COPY tsconfig.base.json ./

RUN pnpm --filter @mppsui/mpp build
RUN pnpm --filter @t2000/sdk build
RUN pnpm --filter @t2000/server db:generate
RUN pnpm --filter @t2000/server build

FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server ./apps/server

RUN apt-get update -y && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/server
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "dist/index.js"]
