.PHONY: test build install clean

test:
	npm test

build:
	docker build -t janos .

install:
	chmod +x janos.sh
	mkdir -p /usr/local/bin
	cp janos.sh /usr/local/bin/janos

clean:
	rm -rf node_modules package-lock.json
