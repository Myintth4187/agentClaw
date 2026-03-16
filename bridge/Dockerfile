FROM node:22-slim

# Use China mirrors for faster builds
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

# Install git (needed for marketplace git clone), psmisc (fuser, needed by --force), Python,
# and Docker CLI (needed for agent sandbox containers via mounted docker.sock)
RUN apt-get update && apt-get install -y git psmisc python3 curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Install openclaw globally (default 2026.3.8, override via build-arg)
ARG OPENCLAW_VERSION=2026.3.8
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g openclaw@${OPENCLAW_VERSION}

# Install bridge dependencies
WORKDIR /app
COPY package.json ./
RUN npm install --registry https://registry.npmmirror.com

# Build bridge TypeScript
COPY tsconfig.json ./
COPY *.ts ./
COPY routes/ ./routes/
RUN npx tsc --version && npx tsc

# Copy platform built-in skills
COPY skills/ ./skills/

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Entry point
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 18080 18789

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/start.js"]
