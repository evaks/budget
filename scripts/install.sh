#!/bin/bash


DIR=/var/www
WWW=/home/evaks/workspace/budget/test

#/etc/systemd/system
SERVICE=/home/evaks/workspace/budget/test-service


EXE=`readlink -f $0`


sudo mkdir -p ${WWW}
sudo mkdir -p ${SERVICE}


if ! id "budget-app" >/dev/null 2>&1; then
	sudo addgroup budget-app --system
	sudo adduser budget-app --home ${WWW} --shell  /bin/bash --no-create-home --disabled-login --system
fi

#sudo addgroup budget-app --system
#sudo adduser budget-app --home /var/www --shell  /bin/bash --no-create-home --disabled-login --system

if  ! dpkg -s snap &> /dev/null ; then
	sudo apt install snap -y
	sudo snap install core; sudo snap refresh core
	sudo apt-get remove certbot -y
	sudo snap install --classic certbot
	sudo ln -s /snap/bin/certbot /usr/bin/certbot


	certbot certonly --webroot --config-dir ${WWW}/letsencrypt/config --work-dir ${WWW}/letsencrypt/work --logs-dir ${WWW}/letsencrypt/log --webroot-path ${WWW}/resources/htdocs --cert-path ${WWW}/letsencrypt/certs --cert-path ${WWW}/letsencrypt/certs/cert.pem --key-path ${WWW}/letsencrypt/certs/priv.pem

fi

if  ! dpkg -s ufw &> /dev/null ; then
	sudo apt install ufw -y
fi

if ! sudo ufw status | grep  443/tcp &> /dev/null ; then
	echo Enabling Firewall
	sudo ufw default deny incoming
	sudo ufw default allow outgoing
	sudo ufw allow ssh
	sudo ufw allow http
	sudo ufw allow https
	sudo ufw enable
fi


awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${WWW} -xj --strip-components=1 -f - scripts/startup.sh
awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${WWW} -xj --strip-components=1 -f - scripts/renew-certs.sh

if [ ! -e /etc/cron.d/budget ]; then
	sudo bash -c 'echo 34 1 \* \* \* '${WWW}'/renew-certs.sh > /etc/cron.d/budget'
fi

NEW=0


if [ ! -e ${WWW}/config.json ]; then
	echo Detected New Installation
	awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${WWW} -xj --strip-components=1 -f - output/config.json
	NEW=1
	sudo sed --in-place -e 's/"port" *: *8080/"port":80/g' test/config.json
	sudo sed --in-place -e 's/"port" *: *8443/"port":443/g' test/config.json
	sudo sed --in-place -e 's/"httpsRedirect" *: *8443/"httpsRedirect":443/g' test/config.json
	sudo sed --in-place -e 's/"..\/letsencrypt\/config\/live/"letsencrypt\/config\/live/g' test/config.json

	read -p "Database root user: " DBUSER
	read -p "Database root user password: " DBPASS
	APPPASS=`openssl rand -base64 14 | sed s/.$//`
	
	sudo sed --in-place -e 's/"user" *: *"root"/"user":"'${DBUSER}'"/g' test/config.json
	sudo sed --in-place -e 's/"password" *: *"password"/"password":"'${DBPASS}'"/g' test/config.json
	sudo sed --in-place -e 's/"password" *: *"zUjA15U9ZrnI6cSkEp0P"/"password":"'${APPPASS}'"/g' test/config.json



	awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${SERVICE} -xj --strip-components=1 -f - service/budget.service
	

	printf "\x1b[33mDon't forget to:\x1b[0m\n"
	printf "\x1b[33m Change the admin user/password it is currently admin/admin\x1b[0m\n"
	printf "\x1b[33m Setup the mail account under Administration/System Settings\x1b[0m\n"

	sudo chown budget-app ${WWW}/config.json
	sudo chmod  a-w,o-r,g-r ${WWW}/config.json

	awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${WWW} -xj --exclude=config.json --strip-components=1 -f - output


	sudo systemctl enable budget
	sudo systemctl daemon-reload
	sudo service budget start
	
else
	sudo rm -rf ${WWW}/resources
	awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | sudo tar -C ${WWW} -xj --exclude=config.json --strip-components=1 -f - output

fi







exit



#todo extract create certbot and schedule

exit
#begin-encoding
