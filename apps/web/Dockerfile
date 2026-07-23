FROM node:20-alpine AS build

WORKDIR /workspace/apps/web

COPY package.json package-lock.json ./
RUN npm ci --workspaces=false

COPY . ./
RUN mkdir -p /workspace/scripts \
    && cp -a build-scripts/. /workspace/scripts/

ARG VITE_API_URL
ARG GENIT_API_URL
ARG GENIT_CLOUD_REQUIRED=true
ARG RAILWAY_GIT_COMMIT_SHA
ARG GITHUB_SHA
ENV VITE_API_URL=${VITE_API_URL} \
    GENIT_API_URL=${GENIT_API_URL} \
    GENIT_CLOUD_REQUIRED=${GENIT_CLOUD_REQUIRED} \
    RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA} \
    GITHUB_SHA=${GITHUB_SHA}

RUN npm run build \
    && test -s dist/index.html \
    && grep -q 'SG_PHASE5_FINANCE_UI_START' dist/index.html \
    && grep -q 'SG_PHASE6_OPERATIONS_UI_START' dist/index.html \
    && grep -q 'SG_PHASE43_EXPORT_EXTENSIONS_UI_START' dist/index.html

FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0
WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/web/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/web/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/web/serve.cjs ./serve.cjs

USER node
EXPOSE 4173

CMD ["node", "serve.cjs"]
