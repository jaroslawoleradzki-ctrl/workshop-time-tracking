# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime stage
FROM nginx:alpine

# Copy the built frontend static files
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy the Nginx configuration into the image
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
