# ── Stage 1: Build ──────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy source files
COPY . .

# Ensure all dependencies and checksums in go.sum are generated
RUN go mod tidy

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /delivery-service ./cmd/server

# ── Stage 2: Runtime (distroless, non-root) ─────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /delivery-service /delivery-service
COPY --from=builder /app/migrations /migrations

EXPOSE 8084

USER nonroot:nonroot

ENTRYPOINT ["/delivery-service"]
