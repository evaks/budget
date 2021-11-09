#!/bin/bash

set -e
useradd -r -U -m -d /var/www web
cp -r output/* /var/www
#keep permissions as root the should not update any files
find /var/www -exec chgrp web {}  \;

wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash

chown root /var/www
chmod 750 /var/www
