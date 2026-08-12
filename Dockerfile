FROM node:24-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY tsconfig.json biome.json ./
COPY src/ ./src/

# Build TypeScript
RUN pnpm build

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV SQLITE_DB_PATH=/app/data/tokens.db

# Expose port
EXPOSE 3001

# Run the HTTP server
CMD ["node", "dist/http.js"]
