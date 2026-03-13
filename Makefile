.PHONY: all dev build test test-e2e test-all lint clean template start

all: preview-stream build

preview-stream: src/main/preview-stream.c
	gcc -O2 -o src/main/preview-stream src/main/preview-stream.c $$(pkg-config --cflags --libs libgphoto2)

dev:
	npm run dev

build:
	npm run build

start: build
	npx electron dist/main/index.js 2>&1 | grep -v 'Glib\|G_IS_OBJECT\|GObject\|dbus'

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
	rm -rf dist src/main/preview-stream
