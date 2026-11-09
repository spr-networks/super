### SPR Image builder

If running on amd64 get the qemu support for aarch64:
./qemu-setup-linux.sh

Next:

1) Run ./download-img.sh to pull the ubuntu image 

2) Run ./run-docker-image-build.sh to prepare SPR to run

3) Run ./write-img.sh /dev/xyz (where xyz is your thumb drive/ sd card)

4) Optionally mount the image and modify /spr-environment.sh to change runtime behavior

APT operations disable download retries (`Acquire::Retries=0`) before upgrading
APT and all installed packages built from its source, including its libraries.
This mitigates CVE-2026-109518 during bootstrap as well as subsequent installs.
Debian images require at least APT 3.0.4 on Trixie or 2.6.2 on Bookworm; an older
package or failed security upgrade stops the image build. Cross-build downloads
use the target image's installed-package database, and the target installs the
cached upgrade before other packages.

Ubuntu images keep retries disabled while using the latest packages available
from their configured repositories or pinned snapshot. Refresh the snapshot and
rebuild when Ubuntu publishes its fix. Rebuilt RPiOS A/B images and update bundles
carry the new packages; changing these scripts does not update deployed devices.



