FROM node:22-alpine

WORKDIR /app

# Install ca-certificates, curl, and kubectl for live cluster auditing
RUN apk add --no-cache ca-certificates curl && \
    ARCH=$(case $(uname -m) in x86_64) echo "amd64" ;; aarch64) echo "arm64" ;; *) echo "amd64" ;; esac) && \
    curl -fsSL -O "https://dl.k8s.io/release/v1.32.2/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl

COPY package*.json ./

RUN npm ci --omit=dev

COPY bin/ ./bin
COPY src/ ./src

ENV BASE_DIR=/var/janos

ENTRYPOINT [ "node", "bin/janos.js" ]
CMD [ "--help" ]
