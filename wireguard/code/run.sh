go build -ldflags "-s -w" -o wireguard_plugin ./wireguard_plugin.go
sudo -E ./wireguard_plugin
