FROM node:18

WORKDIR /app

# Install ffmpeg
RUN apt-get update \
  && apt-get install -y ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Install deps
COPY consumer/backend/package.json consumer/backend/package-lock.json* ./
RUN npm install

# Copy source and shared proto
COPY consumer/backend/src ./src
COPY proto ./proto

# Uploads directory
RUN mkdir -p /app/uploads
ENV CONSUMER_UPLOAD_DIR=/app/uploads
ENV FFMPEG_PATH=ffmpeg
ENV NODE_ENV=production

EXPOSE 4000 50051

CMD ["npm", "start"]
