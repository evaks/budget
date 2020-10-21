.DEFAULT_GOAL := build

build:
	rm -rf output
	rm -rf generated
	mkdir output
	node aurora/build build.json

drop-db:
	echo 'drop database budget; create database budget' | mysql --user=root --password=password

create-db:
	echo 'create database budget' | mysql --user=root --password=password

server:
	node aurora/build build.json server
resources:
	node aurora/build build.json resources
debug-server:
	node aurora/build build.json debug-server

client:
	node aurora/build build.json client

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
	jest --testPathIgnorePatterns plugins/closure-library 
else
	jest --testPathIgnorePatterns plugins/closure-library -t '$(UNIT_TEST)'
endif

.PHONY: rerun-test
rerun-test:
ifndef UNIT_TEST
	jest --testPathIgnorePatterns plugins/closure-library 
else
	jest --testPathIgnorePatterns plugins/closure-library -t '$(UNIT_TEST)'
endif

.PHONY: install-modules
install-modules:
	npm install node-forge mime modern-syslog websocket async mysql moment
