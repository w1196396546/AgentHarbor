# syntax=docker/dockerfile:1
FROM node:22-bookworm AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
RUN mkdir -p internal/relay/assets && npm run build

FROM golang:1.26.8-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY --from=frontend /src/internal/relay/assets ./internal/relay/assets
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /anywhereToAgent ./cmd/anywhereToAgent

FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
    && addgroup -g 10001 relay \
    && adduser -D -u 10001 -G relay relay \
    && mkdir -p /data \
    && chown relay:relay /data
COPY --from=builder /anywhereToAgent /usr/local/bin/anywhereToAgent
WORKDIR /data
USER 10001:10001
ENTRYPOINT ["anywhereToAgent"]
CMD ["--data-dir", "/data", "--listen", "127.0.0.1:8080", "--admin-listen", "127.0.0.1:9090"]
