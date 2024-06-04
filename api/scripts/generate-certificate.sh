#!/bin/bash
# how to run this script:
#
# ./generate-certificate.sh status
# # show status of current cert, return 1 if less than 60 days until expire
#
# ./generate-certificate.sh
# # regenerate leaf cert
#
# GENERATE_CA=1 ./generate-certificate.sh
# # regenerate all certs

CERT_NAME="www-api"
CN="spr"
ALTNAME="IP:192.168.2.1,DNS:spr.local,DNS:spr"

D="/"
if [ ! -d "$D/configs" ]; then
	SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
	D="${SCRIPT_DIR}/../.."
fi

if [ ! -d "$D/configs/auth/cert" ]; then
	mkdir "$D/configs/auth/cert"
fi

CA_KEY="$D/configs/auth/cert/${CERT_NAME}-ca.key"
CA_CSR="$D/configs/auth/cert/${CERT_NAME}-ca.csr"
CA_CRT="$D/configs/auth/cert/${CERT_NAME}-ca.crt"
CA_PEM="$D/configs/auth/cert/${CERT_NAME}-ca.pem"

INT_CRT="$D/configs/auth/cert/${CERT_NAME}-inter.crt"
INT_CSR="$D/configs/auth/cert/${CERT_NAME}-inter.csr"
INT_KEY="$D/configs/auth/cert/${CERT_NAME}-inter.key"

CERT_CSR="$D/configs/auth/${CERT_NAME}.csr"
CERT_CRT="$D/configs/auth/${CERT_NAME}.crt"
CERT_KEY="$D/configs/auth/${CERT_NAME}.key"
CERT_PFX="$D/configs/auth/${CERT_NAME}.pfx"

if [ "$1" = "status" ]; then
    #check if cert is about to expire, 60 days
    if openssl x509 -checkend $((86400*60)) -noout -in "$CERT_CRT" > /dev/null; then
        echo -ne "+ certificate ok, expire: "
        openssl x509 -enddate -noout -in "$CERT_CRT"
        RET=0
    else
        echo -ne "- certificate will expire soon: "
        openssl x509 -enddate -noout -in "$CERT_CRT"
        RET=1
    fi
    exit $RET
fi

DAYS_CA=$((365*10)) #10 years for ca/int
DAYS_CERT=$((365*2))

if [ -z "$SKIPPASS" ]; then
    SKIPPASS="-passout pass:"
fi

#CERT_SELF_SIGNED="$D/configs/auth/self-signed-cert.ext"
#echo "subjectAltName = @alt_names\n[alt_names]\nDNS.1 = ${CN}\nDNS.2 = https-server" > $CERT_SELF_SIGNED

# can set GENERATE_CA to generate everything
if [[ -z "$GENERATE_CA" ]]; then
    GENERATE_CA=$(if [ ! -f "$CA_KEY" ]; then echo 1 ;else echo 0; fi)
else
    GENERATE_CA=1
fi

if [ $GENERATE_CA -gt 0 ]; then

echo "+ generating ca..."

# CA
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $CA_CSR -keyout $CA_KEY -extensions v3_ca
openssl x509 -signkey $CA_KEY -days $DAYS_CA -req -in $CA_CSR -set_serial 01 -out $CA_CRT

# INT
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $INT_CSR -keyout $INT_KEY -addext basicConstraints=CA:TRUE
openssl x509 -CA $CA_CRT -CAkey $CA_KEY -days $DAYS_CA -req -in $INT_CSR -set_serial 02 -out $INT_CRT

fi

echo "+ generating cert..."
# test cert
openssl req -new -subj "/C=US/ST=California/CN=${CN}" -newkey rsa:2048 -nodes -out $CERT_CSR -keyout $CERT_KEY

# sign
openssl x509 -CA $INT_CRT -CAkey $INT_KEY -days $DAYS_CERT -req -in $CERT_CSR -set_serial 03 -extfile <(printf "subjectAltName=${ALTNAME}") -out $CERT_CRT

# export
openssl pkcs12 -export -out $CERT_PFX -inkey $CERT_KEY -in $CERT_CRT -certfile $INT_CRT -certfile $CA_CRT $SKIPPASS
