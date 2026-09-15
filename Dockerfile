FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY bin/ ./bin
COPY src/ ./src

ENV BASE_DIR=/var/janos

ENTRYPOINT [ "node", "bin/janos.js" ]
CMD [ "--help" ]
