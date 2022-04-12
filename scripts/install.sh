#!/bin/bash


DIR=/var/www

EXE=`readlink -f $0`


awk 'BEGIN {p = 0} { if (p) print $0} /^#begin-encoding/ { p = 1 } ' ${EXE} | base64 -d  | tar -C test -xj -f -

exit
sudo mkdir ${DIR}
sudo chown root ${DIR}

sudo addgroup budget-app --system
sudo adduser budget-app --home /var/www --shell  /bin/bash --no-create-home --disabled-login --system


#todo extract shar
#todo

#todo check not installed

sudo snap install core; sudo snap refresh core
sudo apt-get remove certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

sudo cp -r ${BASE}/output/* ${DIR}
sudo cp -r ${BASE}/scripts/startup.sh ${DIR}
sudo chown budget-app ${DIR}/config.json
sudo chmod  a-w,o-r,g-r ${DIR}/config.json


# allow service to bind
sudo cp ${BASE}/service/budget.service /etc/systemd/system/budget.service
sudo systemctl enable budget.service
sudo systemctl daemon-reload
sudo service budget.service start


exit
#begin-encoding
