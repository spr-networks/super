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

openssl genrsa -out $CA_KEY 4096
openssl req -x509 -new -subj "/C=US/ST=California/CN=${CN}" -nodes -key $CA_KEY -sha256 -days $DAYS_CA -out $CA_CRT

fi

echo "+ generating cert..."

openssl genrsa -out $CERT_KEY 4096
cat > /tmp/cert.conf <<__EOF
[ req ]
prompt             = no
default_bits       = 4096
distinguished_name = req_distinguished_name
req_extensions     = req_ext
[ req_distinguished_name ]
countryName                = US
localityName               = California
organizationName           = spr
commonName                 = 192.168.2.1
[ req_ext ]
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = spr.local
IP.1 = 192.168.2.1
__EOF

openssl req -new -key $CERT_KEY -config /tmp/cert.conf -out $CERT_CSR

#verify
#openssl req -in $CERT_CSR -noout -text

#issue cert
openssl x509 -req -in $CERT_CSR -CA $CA_CRT -CAkey $CA_KEY -CAcreateserial \
    -out $CERT_CRT -days $DAYS_CERT \
    -sha256 -extfile /tmp/cert.conf -extensions req_ext

rm -f /tmp/cert.conf

# export
openssl pkcs12 -export -out $CERT_PFX -inkey $CERT_KEY -in $CERT_CRT -certfile $CA_CRT $SKIPPASS
