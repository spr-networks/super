. configs/base/config.sh

cat << EOF
watchdog-device = /dev/watchdog
watchdog-timeout = 300
#interface = $VLANIF

EOF
