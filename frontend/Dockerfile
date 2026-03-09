# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build-time variables (VITE_* are baked into the bundle)
ARG VITE_DEMO_MODE=false
ARG VITE_BASE_PATH=/
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:stable-alpine

# Static files
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config: serve SPA + proxy /api and /ws to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
