FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY index.html ./
COPY server ./server
COPY src ./src
COPY examples/grooveprint-demo.csv ./examples/grooveprint-demo.csv
RUN mkdir -p /data && chown -R node:node /app
EXPOSE 4173
# Railway mounts /data after image build; fix its ownership at runtime, then drop root privileges.
CMD ["sh", "-c", "chown node:node /data && exec su -s /bin/sh node -c 'node server/app.mjs'"]
