FROM node:22-alpine

WORKDIR /app

# Install ca-certificates and kubectl for live cluster auditing, then remove curl
RUN apk add --no-cache ca-certificates && \
    apk add --no-cache --virtual .dl-deps curl && \
    ARCH=$(case $(uname -m) in x86_64) echo "amd64" ;; aarch64) echo "arm64" ;; *) echo "amd64" ;; esac) && \
    curl -fsSL -O "https://dl.k8s.io/release/v1.34.1/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl && \
    apk del .dl-deps

COPY package*.json ./

RUN npm ci --omit=dev

COPY bin/ ./bin
COPY src/ ./src

ENV BASE_DIR=/var/janos

USER node

ENTRYPOINT [ "node", "bin/janos.js" ]
CMD [ "--help" ]
