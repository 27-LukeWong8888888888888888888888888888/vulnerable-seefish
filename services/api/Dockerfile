# Campus lab booking API — runtime image (Phase 2).
# Build context is the repository root (see compose.yaml).
# The image mirrors the repo layout so relative requires (e.g.
# src/ -> ../../shared) resolve identically on host and in the container.
FROM node:22-alpine

WORKDIR /app

COPY services/api/package.json services/api/package-lock.json services/api/
RUN cd services/api && npm ci --omit=dev

COPY services/api/ services/api/
COPY shared/ shared/
COPY scripts/ scripts/

EXPOSE 3000
CMD ["node", "services/api/server.js"]
