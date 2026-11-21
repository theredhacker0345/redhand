# redhand MCP server — stdio transport.
# Starts instantly and answers MCP introspection without a browser; the
# browser attaches lazily on the first tool call (REDHAND_CDP_PORT).
FROM node:22-alpine

RUN npm install -g pnpm@12 --silent

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production
ENTRYPOINT ["node", "packages/mcp/dist/index.js"]
