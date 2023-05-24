
# SPR headless test with macsim


## Clients

- sta1,sta2,sta3 connect to ap (TestLab)
- sta4 runs nodejs tests in code/, same password as sta3

# Setup

TODO

## Dependencies

if running the tests on the host, nodejs is required for sta4:

```sh
apt-get update && apt-get install -y \
    software-properties-common \
    npm
npm install n -g && \
    n latest
```
