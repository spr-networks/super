go build -ldflags "-s -w" -o tailscale_plugin ./tailscale_plugin.go
export LANIP=192.168.2.1
sudo -E ./tailscale_plugin
