go build -ldflags "-s -w" -o wireguard_plugin ./wireguard_plugin.go
export LANIP=192.168.2.1
sudo -E ./wireguard_plugin
