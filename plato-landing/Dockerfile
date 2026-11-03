# Build the static export, then serve it with Caddy's file server (no Node at runtime).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/out /srv
CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":80"]
