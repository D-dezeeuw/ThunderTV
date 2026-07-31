# The home proxy, containerised. Deliberately dependency-free: `home-proxy.mjs`
# wraps `proxy-server.mjs`, which wraps the unchanged Cloudflare Worker module,
# and between them they import nothing but `node:http`. There is no
# `npm install` step here because there is nothing to install — copying the
# three files is the whole build.
FROM node:22-alpine

WORKDIR /app

# Copied individually rather than the whole directory: this image should not
# quietly grow a dependency on some other script in `scripts/`.
COPY scripts/home-proxy.mjs scripts/proxy-server.mjs scripts/cloudflare-cors-proxy.mjs ./scripts/

# The base image ships a non-root `node` user; nothing here writes to disk or
# binds a privileged port, so there is no reason to run as root.
USER node

ENV PORT=8899
EXPOSE 8899

# Any HTTP answer proves the listener is alive. `/` with no target resolves to
# a 400 ("bad target url") — that is a healthy response from this server, so
# the check deliberately accepts it and only fails when the connection itself
# does.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8899) + '/').then(() => process.exit(0)).catch(() => process.exit(1))"

CMD ["node", "scripts/home-proxy.mjs"]
