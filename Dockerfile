FROM node:24-bookworm

# ── System deps ──────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path && \
    ln -s /root/.opencode/bin/opencode /usr/local/bin/opencode

# OpenAI device auth tool (for headless OAuth login)
RUN git clone https://github.com/tumf/opencode-openai-device-auth.git /opt/openai-auth && \
    cd /opt/openai-auth && npm install && npm run build && \
    ln -s /opt/openai-auth/dist/index.js /usr/local/bin/opencode-openai-device-auth && \
    chmod +x /opt/openai-auth/dist/index.js

# ── App ──────────────────────────────────────────────────────────────────────
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# ── Entrypoint ───────────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
