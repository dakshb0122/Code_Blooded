# Purpose: build the React bundle and serve it from a small unprivileged web container.

FROM node:22-alpine AS build

# Define the isolated frontend workspace used during dependency installation and build.
WORKDIR /app

# Install the lockfile-pinned frontend dependencies before copying source files.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the frontend source and produce the static production bundle.
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

# Provide the SPA fallback and a private health endpoint for Compose readiness.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Document the non-root Nginx listener used only inside the Compose network.
EXPOSE 8080
