# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json tsconfig.json knexfile.cjs ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=deps /app/dist ./dist
COPY --from=deps /app/migrations ./migrations
COPY --from=deps /app/knexfile.cjs ./knexfile.cjs
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
