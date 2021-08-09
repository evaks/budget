.DEFAULT_GOAL := build

build-code: node_modules
	rm -rf output
	rm -rf generated
	mkdir output
	node aurora/build build.json

.PHONY: build
build: build-code test module-test

drop-db:
	echo 'drop database budget; create database budget' | mysql --user=root --password=password

create-db:
	echo 'create database budget' | mysql --user=root --password=password


output/server.min.js: node_modules $(wildcard plugins/**/*.server.js)  $(wildcard plugins/**/*.shared.js) $(wildcard aurora/plugins/**/*.server.js) $(wildcard aurora/plugins/**/*.shared.js) $(wildcard plugins/recoil/**/*.js) $(wildcard plugins/closure-library/**/*.js) $(wildcard plugins/**/*.schema.json)
	node aurora/build build.json server

.PHONY: server
server: output/server.min.js
	node aurora/build build.json server

resources: node_modules
	node aurora/build build.json resources
debug-server: node_modules
	node aurora/build build.json debug-server

client: node_modules
	node aurora/build build.json client

output/module-test.min.js: $(wildcard plugins/**/*.server.js)  $(wildcard plugins/**/*.shared.js) $(wildcard aurora/plugins/**/*.server.js) $(wildcard aurora/plugins/**/*.shared.js) $(wildcard plugins/recoil/**/*.js) $(wildcard plugins/closure-library/**/*.js) $(wildcard plugins/**/*.schema.json)
	node aurora/build build.json module-test

.PHONY: module-test
module-test: output/module-test.min.js output/server.min.js
	node output/server.min.js --test 1> /dev/null 2>  /dev/null &
#	node output/server.min.js --test &
ifndef UNIT_TEST
	node_modules/.bin/jest --config=mjest.config.js 
else
	node_modules/.bin/jest --config=mjest.config.js -t '$(UNIT_TEST)'
endif





.PHONY: debug-client
debug-client:
	node aurora/build build.json debug-client

.PHONY: lintfix
lintfix:
	fixjsstyle --disable 0100,0110,0120,0251 `find plugins -name "*.js" -and -not -name "*_test.js" -and -not -path "plugins/closure-library/*" -not -name "*.min.js" -and -not -name "*.lib.js" -and -not -name build.js -and -not -type d`

.PHONY: test
test:
	node aurora/build build.json test-server	
ifndef UNIT_TEST
	node_modules/.bin/jest --testPathIgnorePatterns plugins/closure-library 
else
	node_modules/.bin/jest --testPathIgnorePatterns plugins/closure-library -t '$(UNIT_TEST)'
endif

.PHONY: rerun-test
rerun-test:
ifndef UNIT_TEST
	node_modules/.bin/jest --testPathIgnorePatterns plugins/closure-library 
else
	node_modules/.bin/jest --testPathIgnorePatterns plugins/closure-library -t '$(UNIT_TEST)'
endif


node_modules:
	npm install


.PHONY: install-modules
install-modules:
	npm install node-forge mime modern-syslog websocket async mysql moment nodemailer multiparty ics glob

