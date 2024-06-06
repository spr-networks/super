#!/bin/bash
set -a
. /configs/base/config.sh
MACHINE_ID=$(ls -1 /var/log/journal|head -1)
echo $MACHINE_ID > /etc/machine-id

# enable ssl if we have a certificate
if [ -f "/configs/auth/www-api.key" ] && [ -f "/configs/auth/www-api.crt" ]; then
	export API_SSL_PORT=443

    # fix update old cert <= 0.3.12
    if [ -f "/configs/auth/cert/www-api-inter.crt" ]; then
        echo "+ old cert found, generate new with scripts/generate-certificate.sh"
        rm -f /configs/auth/cert/www-api-inter.*
        /scripts/generate-certificate.sh
    fi

    # check if cert expire soon
    #/scripts/generate-certificate.sh status > /dev/null
    #test $? -eq 0 || /scripts/generate-certificate.sh
fi

/api
