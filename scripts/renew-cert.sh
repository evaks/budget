#!/bin/bash
DIR=/var/www

certbot renew --webroot --config-dir ${DIR}/letsencrypt/config --work-dir ${DIR}/letsencrypt/work --logs-dir ${DIR}/letsencrypt/log --webroot-path ${DIR}/resources/htdocs --cert-path ${DIR}/letsencrypt/certs --cert-path ${DIR}/letsencrypt/certs/cert.pem --key-path ${DIR}/letsencrypt/certs/priv.pem

chown budget-app ${DIR}/letsencrypt/config/archive/budgetservice.org.nz/*/*

chgrp budget-app ${DIR}/letsencrypt/config/archive/budgetservice.org.nz/*/*
