# Plato web app (Next.js, standalone output). NEXT_PUBLIC_API_URL is baked in at build time.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Where a seeker writes for a plan, a top-up or help (no payment provider yet).
ARG NEXT_PUBLIC_SUPPORT_EMAIL=
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
# Chrome Web Store page of Plato Apply; empty until it is published (onboarding shows install help).
ARG NEXT_PUBLIC_EXTENSION_STORE_URL=
ENV NEXT_PUBLIC_EXTENSION_STORE_URL=$NEXT_PUBLIC_EXTENSION_STORE_URL
# Plato Apply ids the web app may hand a pairing code to (unpacked build, Web Store); empty = the unpacked build's id.
ARG NEXT_PUBLIC_EXTENSION_IDS=
ENV NEXT_PUBLIC_EXTENSION_IDS=$NEXT_PUBLIC_EXTENSION_IDS
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3001
CMD ["node", "server.js"]
