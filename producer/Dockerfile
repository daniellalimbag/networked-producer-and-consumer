FROM node:18-alpine

WORKDIR /app

# Install deps
COPY producer/package.json producer/package-lock.json* ./
RUN npm install

# Copy source and shared proto
COPY producer/src ./src
COPY proto ./proto

ENV NODE_ENV=production

# Default: single producer using env (can be overridden in docker-compose or docker run)
CMD ["npm", "start"]
