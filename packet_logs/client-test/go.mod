module main

go 1.25.0

require github.com/google/gopacket v1.1.19

require (
	github.com/sirupsen/logrus v1.9.4 // indirect
	github.com/spr-networks/sprbus-json v0.0.0
	golang.org/x/sys v0.42.0 // indirect
)

replace github.com/spr-networks/sprbus-json => ../../sprbus-json
