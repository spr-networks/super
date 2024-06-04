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
        echo "+ old cert found, generating new..."
        rm -f /configs/auth/cert/www-api-inter.*
        /scripts/generate-certificate.sh
    fi
fi

/api
