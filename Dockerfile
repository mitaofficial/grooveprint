FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY index.html ./
COPY server ./server
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4173
CMD ["node", "server/app.mjs"]
