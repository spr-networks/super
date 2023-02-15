#!/bin/bash

# reset hwsim
modprobe -r mac80211_hwsim
modprobe mac80211_hwsim radios=4
ip link set dev hwsim0 up


move_iface_pid() {
  PID=$(docker inspect --format='{{.State.Pid}}' $2)
  PHY=phy$(iw $1 info | grep wiphy | awk '{print $2}')
  #echo move $1 is $PHY to $2 is $PID
  iw phy $PHY set netns $PID
}


# Move APs to superbase
move_iface_pid "wlan0" "superbase"
move_iface_pid "wlan1" "superbase"

# Run wifid start script again
docker exec -d superwifid /scripts/startup.sh

# give a radio to the stations
move_iface_pid "wlan2" "sta1"
move_iface_pid "wlan3" "sta2"

#move_iface_pid "wlan4" "sta3"
#move_iface_pid "wlan5" "sta4"
