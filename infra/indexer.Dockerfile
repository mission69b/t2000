FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/sdk/package.json packages/sdk/

RUN pnpm install --frozen-lockfile

COPY packages/sdk packages/sdk/
COPY apps/server apps/server/
COPY tsconfig.base.json ./

RUN pnpm --filter @t2000/sdk build
RUN pnpm --filter @t2000/server db:generate
RUN pnpm --filter @t2000/server build

FROM node:22-slim AS runner

WORKDIR /app

COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

ENV NODE_ENV=production
WORKDIR /app/apps/server
CMD ["node", "dist/indexer/index.js"]
