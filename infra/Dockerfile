FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/booking/package.json apps/booking/package.json
COPY apps/personal/package.json apps/personal/package.json
COPY server/contracts/package.json server/contracts/package.json
COPY server/mail/package.json server/mail/package.json
COPY server/contact/package.json server/contact/package.json
COPY server/marketing/package.json server/marketing/package.json
COPY server/database/package.json server/database/package.json
COPY server/runtime/package.json server/runtime/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS source
COPY server ./server
COPY apps/booking ./apps/booking
COPY infra/run.mjs ./infra/run.mjs
COPY infra/build-runtime-probes.mjs ./infra/build-runtime-probes.mjs
COPY infra/probes ./infra/probes
RUN node infra/build-runtime-probes.mjs
ENV NEXT_TELEMETRY_DISABLED=1

FROM source AS booking-build
RUN npm run build:booking

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS booking
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=booking-build /app/apps/booking/.next/standalone ./
COPY --from=booking-build /app/apps/booking/.next/static ./apps/booking/.next/static
COPY --from=booking-build /app/apps/booking/public ./apps/booking/public
COPY --from=source /app/artifacts/runtime-probes/booking ./probes
USER 10001:10001
EXPOSE 3000
CMD ["node", "--env-file=/run/secrets/runtime", "apps/booking/server.js"]

FROM source AS communications
RUN mv artifacts/runtime-probes/communications probes && rm -rf artifacts/runtime-probes
ENV NODE_ENV=production HOST=0.0.0.0
USER 10002:10002
CMD ["node", "--env-file=/run/secrets/runtime", "--import", "tsx", "server/runtime/main.ts", "booking"]

FROM source AS worker
RUN mv artifacts/runtime-probes/worker probes && rm -rf artifacts/runtime-probes
ENV NODE_ENV=production HOST=0.0.0.0
USER 10003:10003
CMD ["node", "--env-file=/run/secrets/runtime", "--import", "tsx", "apps/booking/server/worker.ts"]

FROM dependencies AS primary-build
COPY apps/personal ./apps/personal
COPY server/contracts ./server/contracts
ARG PUBLIC_SERVICES_URL
ARG PUBLIC_BOOKING_URL
ENV DD_MODE=production PUBLIC_SERVICES_URL=$PUBLIC_SERVICES_URL PUBLIC_BOOKING_URL=$PUBLIC_BOOKING_URL
RUN npm run build:personal
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS primary
COPY --from=primary-build /app/apps/personal/dist /usr/share/nginx/html
