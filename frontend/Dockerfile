# Frontend containerization — Owner: Reece DockerFile
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements change.
COPY package*.json ./
RUN npm install

# Copy the app.
COPY . .
RUN npm run build

# Production image
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
