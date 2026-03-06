FROM node:24-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Runtime defaults (can be overridden by env vars)
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/ticketforge.db

# Ensure persistence directory exists
RUN mkdir -p /app/data && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
