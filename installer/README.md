### SPR Image builder

If running on amd64 get the qemu support for aarch64:
./qemu-setup-linux.sh

Next:

1) Run ./download-img.sh to pull the ubuntu image 

2) Run ./run-docker-image-build.sh to prepare SPR to run

3) Run ./write-img.sh /dev/xyz (where xyz is your thumb drive/ sd card)

4) Optionally mount the image and modify /spr-environment.sh to change runtime behavior

Builders upgrade APT and its installed libraries before installing other packages.
The pinned Ubuntu snapshot includes the APT 2.8.4ubuntu0.1 security fix.
Cross-build downloads use the target image's installed-package database, and the
target installs the cached upgrade before other packages. Rebuilt images and
update bundles carry the new packages; changing these scripts does not update
deployed devices.



