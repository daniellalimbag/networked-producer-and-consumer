# Build stage
FROM node:18-alpine AS build

WORKDIR /app

COPY consumer/frontend/package.json consumer/frontend/package-lock.json* ./
RUN npm install

COPY consumer/frontend/index.html consumer/frontend/vite.config.js ./
COPY consumer/frontend/src ./src

# Default backend URLs for access from the host browser
ENV VITE_API_BASE=http://localhost:4000
ENV VITE_WS_URL=ws://localhost:4000

RUN npm run build

# Serve stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
