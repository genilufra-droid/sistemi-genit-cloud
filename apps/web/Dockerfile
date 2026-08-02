FROM node:20-alpine AS build

WORKDIR /workspace/apps/web

# The verified self-contained web source is stored in compressed parts and is
# restored during the build. Alpine does not include xz by default.
RUN apk add --no-cache xz

COPY package.json package-lock.json ./
RUN npm ci --workspaces=false

COPY . ./

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

# Invoke the local build file explicitly.  Railway can build this service from
# a nested root directory, where `npm run build` may resolve a different
# package script and finish without producing the web artifact.
RUN node ./build-self-contained.cjs \
    && node -e "const fs=require('node:fs');const p='/workspace/apps/web/dist/index.html';if(!fs.existsSync(p)||fs.statSync(p).size===0)throw new Error('dist/index.html mungon ose është bosh');const h=fs.readFileSync(p,'utf8');for(const m of ['SG_PHASE5_FINANCE_UI_START','SG_PHASE6_OPERATIONS_UI_START','SG_PHASE43_EXPORT_EXTENSIONS_UI_START','SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START','SG_PHASE83_REAL_DOCUMENT_LINKS_START','SG_PHASE89_CLEAN_DOCUMENT_TAB_START','SG_PHASE95_COMBO_SELECTION_COMMIT_START','SG_PHASE96_DOCUMENT_FIDELITY_START','SG_PHASE97_CLOUD_RETURNS_START','SG_PHASE100_PURCHASE_AUDIT_FIXES_START']){if(!h.includes(m))throw new Error('Mungon marker-i '+m)}console.log('Railway web artifact validated, bytes='+Buffer.byteLength(h));"

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
