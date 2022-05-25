#!/bin/bash

CERT_NAME="www-api"
CN="spr"

D="/"
if [ ! -d "$D/configs" ]; then
	SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
	D="${SCRIPT_DIR}/../.."
fi

if [ ! -d "$D/configs/base/cert" ]; then
	mkdir "$D/configs/base/cert"
fi

CA_KEY="$D/configs/base/cert/${CERT_NAME}-ca.key"
CA_CSR="$D/configs/base/cert/${CERT_NAME}-ca.csr"
CA_CRT="$D/configs/base/cert/${CERT_NAME}-ca.crt"
CA_PEM="$D/configs/base/cert/${CERT_NAME}-ca.pem"

INT_CRT="$D/configs/base/cert/${CERT_NAME}-inter.crt"
INT_CSR="$D/configs/base/cert/${CERT_NAME}-inter.csr"
INT_KEY="$D/configs/base/cert/${CERT_NAME}-inter.key"

CERT_CSR="$D/configs/base/${CERT_NAME}.csr"
CERT_CRT="$D/configs/base/${CERT_NAME}.crt"
CERT_KEY="$D/configs/base/${CERT_NAME}.key"
CERT_PFX="$D/configs/base/${CERT_NAME}.pfx"

#CERT_SELF_SIGNED="$D/configs/base/self-signed-cert.ext"
#echo "subjectAltName = @alt_names\n[alt_names]\nDNS.1 = ${CN}\nDNS.2 = https-server" > $CERT_SELF_SIGNED

# CA
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $CA_CSR -keyout $CA_KEY -extensions v3_ca
openssl x509 -signkey $CA_KEY -days 365 -req -in $CA_CSR -set_serial 01 -out $CA_CRT

# INT
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $INT_CSR -keyout $INT_KEY -addext basicConstraints=CA:TRUE
openssl x509 -CA $CA_CRT -CAkey $CA_KEY -days 365 -req -in $INT_CSR -set_serial 02 -out $INT_CRT

# test cert
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $CERT_CSR -keyout $CERT_KEY

# sign
openssl x509 -CA $INT_CRT -CAkey $INT_KEY -days 365 -req -in $CERT_CSR -set_serial 03 -out $CERT_CRT

# export
openssl pkcs12 -export -out $CERT_PFX -inkey $CERT_KEY -in $CERT_CRT -certfile $INT_CRT -certfile $CA_CRT
