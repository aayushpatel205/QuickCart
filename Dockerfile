# ===================================================
# Stage 1: Build & Dependencies Installation
# ===================================================
FROM node:20-alpine AS dependencies

WORKDIR /usr/src/app

# Install build dependencies if native addons needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# ===================================================
# Stage 2: Final Minimal Runtime Image
# ===================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8082
ENV GRPC_PORT=50051

# Copy dependencies from builder stage
COPY --chown=node:node --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node proto/ ./proto/
COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/

# Switch to non-root user (security best practice)
USER node

# Expose REST (8082) and gRPC (50051) ports
EXPOSE 8082 50051

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8082/health || exit 1

# Start the service
CMD ["node", "src/server.js"]
