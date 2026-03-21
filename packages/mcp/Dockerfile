FROM node:22-slim

RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
COPY packages/mpp-sui/package.json packages/mpp-sui/
COPY patches/ patches/
RUN pnpm install --frozen-lockfile

COPY packages/sdk packages/sdk/
COPY packages/mpp-sui packages/mpp-sui/
COPY packages/mcp packages/mcp/
RUN pnpm --filter @t2000/sdk build && \
    pnpm --filter @t2000/mpp-sui build && \
    pnpm --filter @t2000/mcp build

ENV T2000_PIN=glama-inspect
RUN node packages/mcp/scripts/setup-test-wallet.mjs

ENTRYPOINT ["node", "packages/mcp/dist/bin.js"]
