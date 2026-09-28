# Purpose: build one small production image shared by the separate API and call-worker containers.

FROM node:22-alpine

# Define the application root used by dependency installation and runtime commands.
WORKDIR /app

# Install pinned runtime dependencies before copying frequently changing source files.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy executable application modules into the image.
COPY src ./src

# Drop root privileges after installing dependencies and source files.
USER node

# Define the API port for local container discovery and Funnel forwarding.
EXPOSE 3000

# Start the API by default; Compose overrides this for the separate worker service.
CMD ["npm", "run", "start:api"]
