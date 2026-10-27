# Everything runs in podman; nothing is installed on the host.
IMAGE ?= localhost/pdfmatrix-webviewer-dev
RUN = podman run --rm --ipc=host -v $(CURDIR):/app -v pmw-node-modules:/app/node_modules -w /app $(IMAGE)

.PHONY: image install build fixtures test test-webpack test-all pack shell

image:
	podman build -t $(IMAGE) -f Containerfile .

install: image
	$(RUN) npm ci --no-audit --no-fund

build:
	$(RUN) npm run build

fixtures:
	$(RUN) npm run fixtures

test: build
	$(RUN) npm test

test-webpack: build
	$(RUN) npm run test:webpack

test-all: test test-webpack

pack: build
	$(RUN) npm pack

shell:
	podman run --rm -it --ipc=host -v $(CURDIR):/app -v pmw-node-modules:/app/node_modules -w /app $(IMAGE) bash
