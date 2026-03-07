.PHONY: all dev build test test-e2e test-all lint clean template start

all: build

dev:
	npm run dev

build:
	npm run build

start: build
	npx electron dist/main/index.js

test:
	npm test

test-e2e: build
	npm run test:e2e

test-all: test test-e2e

lint:
	npm run lint

template:
	npx tsx scripts/generate-template.ts

clean:
	rm -rf dist
