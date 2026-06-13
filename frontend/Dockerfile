# Frontend containerization — Owner: Reece DockerFile
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements change.
COPY package*.json ./
RUN npm install

# Copy the app (also bind-mounted in docker-compose.yml for live editing).
COPY . .
RUN npm run build

# Production image
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

# --host 0.0.0.0 makes the server reachable from outside the container.
CMD ["nginx", "-g", "daemon off;"]

