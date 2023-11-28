#!/bin/bash
sudo apt-get update --fix-missing #try to fix azure ubuntu issue
sudo apt-get install -y qemu qemu-utils binfmt-support qemu-user-static # Install the qemu packages
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes # This step will execute the registering scripts
sudo apt-get installl -y cloud-guest-utils

