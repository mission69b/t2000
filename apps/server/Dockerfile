FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/sdk/package.json packages/sdk/
COPY apps/server/prisma apps/server/prisma/

RUN pnpm install --frozen-lockfile

COPY packages/sdk packages/sdk/
COPY apps/server apps/server/
COPY tsconfig.base.json ./

RUN pnpm --filter @t2000/sdk build
RUN pnpm --filter @t2000/server db:generate
RUN pnpm --filter @t2000/server build

FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
