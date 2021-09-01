#!/bin/bash

# AWUS036ACM has a bug with scatter gather support where the driver will crash
# Disable usb sg as a workaround
if grep -L "mt76-usb disable_usb_sg=1" /etc/modules; then
 echo mt76-usb disable_usb_sg=1 >> /etc/modules
fi
