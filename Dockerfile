# Multi-stage build for NestJS application (Railway optimized)

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

# Non-interactive installs. pnpm 11+ prompts to approve build scripts when
# this is unset, and a Docker build has no TTY.
ENV CI=true

# Pin pnpm 10. `npm install -g pnpm` follows latest, and pnpm 11+ (store v11)
# fails the image build on unapproved dependency scripts. It also requires
# Node 22; this image is Node 20. pnpm 10 matches CI.
RUN npm install -g pnpm@10 && \
    apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files. pnpm-workspace.yaml holds allowBuilds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS build

ENV CI=true

# Install pnpm and ffmpeg (required for video compression)
RUN npm install -g pnpm@10 && \
    apk add --no-cache ffmpeg

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and config files (exclude dist to avoid conflicts)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json nest-cli.json ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma Client
RUN pnpm prisma generate

# Clean any existing dist and build the application
RUN rm -rf dist && pnpm build

# Verify dist was created with compiled JavaScript files (main.js is in dist/src/)
RUN test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found after build!" && exit 1) && \
    echo "SUCCESS: Build completed successfully!"

# Stage 3: Production
FROM node:20-alpine AS production

ENV CI=true

WORKDIR /app

# Install pnpm and ffmpeg (required for video compression)
RUN npm install -g pnpm@10 && \
    apk add --no-cache ffmpeg

# Copy package files. pnpm-workspace.yaml holds allowBuilds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install only production dependencies (Prisma is already in dependencies)
RUN pnpm install --prod --frozen-lockfile

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client in production stage (more reliable than copying)
RUN pnpm prisma generate

# Run migrations if DATABASE_URL is provided as build arg
# Note: For most platforms, migrations run at startup (see CMD), but this allows pre-migration during build
ARG DATABASE_URL
RUN if [ -n "$DATABASE_URL" ]; then pnpm prisma migrate deploy; fi

# Copy built application
COPY --from=build /app/dist ./dist

# Verify dist was copied and contains main.js
RUN test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found!" && exit 1)

# Copy Firebase credentials if they exist (Railway will handle this via env vars or file mounts)
COPY firebase-credentials.json* ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

# Railway sets PORT automatically, but we default to 8080
ENV PORT=8080

EXPOSE 8080

# Health check (using root endpoint)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT}/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start script that runs migrations then starts the app
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/src/main.js"]

