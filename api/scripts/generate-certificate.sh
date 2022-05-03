#!/bin/bash
CERT_NAME="www-api"
CN="spr"
CERT_KEY_FILENAME="/configs/base/${CERT_NAME}.key"
CERT_CSR_FILENAME="/configs/base/${CERT_NAME}.csr"
CERT_CRT_FILENAME="/configs/base/${CERT_NAME}.crt"
CERT_SELF_SIGNED="/configs/base/self-signed-cert.ext"

echo "subjectAltName = @alt_names\n[alt_names]\nDNS.1 = ${CN}\nDNS.2 = https-server" > $CERT_SELF_SIGNED

openssl req -new -subj "/C=US/ST=California/CN=${CN}" \
    -newkey rsa:2048 -nodes -keyout $CERT_KEY_FILENAME -out $CERT_CSR_FILENAME
openssl x509 -req -days 365 \
	-in $CERT_CSR_FILENAME \
	-signkey $CERT_KEY_FILENAME \
	-out $CERT_CRT_FILENAME \
	-extfile $CERT_SELF_SIGNED
