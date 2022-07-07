### SPR Image builder

If running on amd64 get the qemu support for aarch64:
./qemu-setup-linux.sh

Next:

1) Run ./download-img.sh to pull the ubuntu image 

2) Run ./run-docker-image-build.sh to prepare SPR to run

3) Run ./write-img.sh /dev/xyz (where xyz is your thumb drive/ sd card)

4) Optionally mount the image and modify /spr-environment.sh to change runtime behavior



