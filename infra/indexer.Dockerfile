FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY . .
RUN pnpm --filter @t2000/sdk build
RUN cd apps/server && npx prisma generate
RUN pnpm --filter @t2000/server build

FROM base AS runner
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/node_modules ./node_modules
COPY --from=build /app/apps/server/prisma ./prisma
COPY --from=build /app/node_modules/.pnpm node_modules/.pnpm

ENV NODE_ENV=production
CMD ["node", "dist/indexer/index.js"]
