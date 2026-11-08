# Web version of `npm run try` for judges. Layer 3 of the security model (see docs/security.md):
# an unprivileged user, only the app's code in the image, and a single writable folder for run results.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

# Run results are the only thing the service writes; everything else stays read-only.
RUN mkdir -p /app/data/web && chown node:node /app/data/web
USER node

ENV PORT=8080 DATA_DIR=/app/data/web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/interface/web/server.ts"]
