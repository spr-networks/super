# SPR headless test with macsim

## Clients

- sta1,sta2,sta3 connect to ap (TestLab)
- sta4 runs nodejs tests in `runner/code/`, same password as sta3

# Setup

for hwsim and host deps on ubuntu:

```sh
apt install -y linux-image-extra-virtual net-tools iw
```

for latest docker compose:
```sh
# remove if already installed (spr image)
apt purge docker-compose docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo   "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" |   tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
service docker start
docker --version && docker compose --version
alias docker-compose="docker compose"
```

## Dependencies

if running the tests on the host, nodejs is required for sta4:

```sh
apt-get update && apt-get install -y \
    software-properties-common \
    npm
npm install n -g && \
    n latest
```
