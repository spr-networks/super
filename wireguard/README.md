# plugin-wireguard

testing the setup:

```sh
docker build -t plugin-wireguard --build-arg TARGETARCH=amd64 .
docker run -v $PWD/../state/wireguard:/state/api -v $PWD/../configs:/configs plugin-wireguard
```

verify plugin is working:
```sh
export SOCK=$PWD/../state/wireguard/wireguard_plugin
sudo chmod a+w $SOCK
curl -s --unix-socket $SOCK http://localhost/peers
```

if no PublicKey is specifed one will be generated:
```sh
curl -s --unix-socket $SOCK http://localhost/peer -X PUT --data "{}"
```

or specify PublicKey:
```sh
KEY=$(wg genkey)
PUBKEY=$(echo $KEY | wg pubkey)
curl -s --unix-socket $SOCK http://localhost/peer -X PUT --data "{\"PublicKey\": \"${PUBKEY}\"}"
```

use the ui for .conf and qrcode
