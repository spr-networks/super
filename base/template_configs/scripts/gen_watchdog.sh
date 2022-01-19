. configs/base/config.sh

cat << EOF
watchdog-device = /dev/watchdog
watchdog-timeout = 15
#interface = $VLANIF

EOF
