FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Copy scripts needed for startup
COPY scripts/docker-startup.sh ./scripts/docker-startup.sh
RUN chmod +x ./scripts/docker-startup.sh

# Install dependencies
RUN bun install

# Copy the application code
# When built with GitHub Actions, this will include the submodule content
COPY . .

# Expose the port
EXPOSE 80
