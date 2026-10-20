.PHONY: build frontend test test-race test-ui vet

build: frontend
	go build -trimpath -o anywhereToAgent ./cmd/anywhereToAgent

node_modules/.package-lock.json: package.json package-lock.json
	npm ci

frontend: node_modules/.package-lock.json
	npm run build

test:
	go test ./...

test-race:
	go test -race ./...

test-ui:
	npm run test:ui

vet:
	go vet ./...
