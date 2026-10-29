# SPR's state on an encrypted persistent partition, as on the rpios image
# (installer/rpi-image-gen: pmap cryptdata, spr-crypt-persistent): a LUKS2
# volume labelled USERDATA_CRYPT, keyed by the same luks-key, holding a GPT
# with one partition, persistent, and its ext4, PERSISTENT, the layout
# rpi-sb-provisioner makes. It's mounted at /persistent, and the paths rpios
# keeps there (slot-shared.d/spr.conf) are bound from it.
#
# The image ships no persistent partition. On the first boot of a flashed
# image the root grows to rootSize instead of to the end of the disk, and
# persistent is made from the rest, with what the root already had at those
# paths. A disk without room for both keeps everything on the root, grown
# to the end, as does a device that was updated into this system: its root
# already fills the disk.
{ config, lib, pkgs, ... }:

let
  # the Nix store: the current and the previous generation, 2 GiB each
  rootSize = 4096; # MiB
  # the least persistent worth making
  minPersistent = 1024; # MiB
  paths = [ "/var/lib/spr" "/var/lib/spr-plugins" "/var/lib/spr-superd" "/var/lib/spr-krun" "/root" ];
  luksKey = ../rpi-image-gen/layer/spr.d/customize.overlay/usr/lib/spr/libexec/luks-key;
in
{
  # spr-persistent grows the root
  sdImage.expandOnBoot = false;

  systemd.services.spr-persistent = {
    description = "SPR persistent state (LUKS2)";
    unitConfig.DefaultDependencies = false;
    wantedBy = [ "local-fs.target" ];
    after = [ "systemd-udevd.service" "systemd-udev-trigger.service" "systemd-remount-fs.service" ];
    before = [ "local-fs.target" "systemd-tmpfiles-setup.service" "shutdown.target" ];
    conflicts = [ "shutdown.target" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    path = with pkgs; [ coreutils util-linux e2fsprogs cryptsetup openssl multipath-tools systemd ];
    script = ''
      root=$(findmnt -no SOURCE /)
      rp=''${root##*/}
      [ -e "/sys/class/block/$rp/partition" ] || exit 0
      disk=$(basename "$(readlink -f "/sys/class/block/$rp/..")")
      dev=/dev/$disk

      # the disk's partition number $1
      partition() {
        local d n
        for d in /sys/class/block/$disk/$disk*; do
          read -r n < "$d/partition"
          [ "$n" = "$1" ] && echo "/dev/''${d##*/}"
        done
        return 0
      }

      part=
      for d in /sys/class/block/$disk/$disk*; do
        if [ "$(blkid -s LABEL -o value "/dev/''${d##*/}" 2>/dev/null)" = USERDATA_CRYPT ]; then
          part=/dev/''${d##*/}
        fi
      done

      if [ -z "$part" ]; then
        read -r num < "/sys/class/block/$rp/partition"
        read -r dsize < "/sys/class/block/$disk/size"
        read -r start < "/sys/class/block/$rp/start"
        read -r rsize < "/sys/class/block/$rp/size"
        # only a root that is the disk's last partition, with free space after it
        [ -z "$(partition $((num + 1)))" ] || exit 0
        # 512-byte sectors
        [ $((dsize - start - rsize)) -gt 32768 ] || exit 0

        if [ $((dsize - start)) -lt $(((${toString rootSize} + ${toString minPersistent}) * 2048)) ]; then
          echo "the disk is too small for persistent, growing the root to the end"
          echo ", +" | sfdisk -q --no-reread --no-tell-kernel -N "$num" "$dev"
          partx -u "$dev"
          resize2fs "$root"
          exit 0
        fi

        echo "growing the root to ${toString rootSize} MiB, making persistent from the rest of $dev"
        echo ", ${toString rootSize}MiB" | sfdisk -q --no-reread --no-tell-kernel -N "$num" "$dev"
        # after the root: the first free space is the gap before the firmware
        echo "start=$((start + ${toString rootSize} * 2048)), type=83" |
          sfdisk -q --no-reread --no-tell-kernel --append "$dev"
        partx -u "$dev"
        udevadm settle
        resize2fs "$root"
        part=$(partition $((num + 1)))
        [ -n "$part" ] || { echo "no partition $((num + 1)) on $dev"; exit 1; }

        fail() { rm -f "$key"; echo "$*: persistent is not set up, SPR keeps its state on the root"; exit 1; }
        key=$(mktemp -p /run)
        CRYPTTAB_SOURCE=$part ${pkgs.runtimeShell} ${luksKey} > "$key" || fail "no key"
        cryptsetup --batch-mode luksFormat --type luks2 --force-password \
          --cipher aes-xts-plain64 --key-size 512 --hash sha256 --sector-size 512 \
          --align-payload 2048 --label USERDATA_CRYPT --key-file "$key" "$part" ||
          fail "luksFormat failed"
        cryptsetup open --key-file "$key" "$part" userdata_crypt || fail "cannot open the LUKS volume"
        rm -f "$key"
        printf 'label: gpt\nname=persistent, type=L\n' |
          sfdisk -q --no-reread --no-tell-kernel /dev/mapper/userdata_crypt ||
          fail "cannot partition the LUKS volume"
        kpartx -a -p p /dev/mapper/userdata_crypt
        udevadm settle
        mkfs.ext4 -q -L PERSISTENT /dev/mapper/userdata_cryptp1 || fail "mkfs failed"
        mkdir -p /persistent
        mount /dev/mapper/userdata_cryptp1 /persistent || fail "cannot mount persistent"
        for p in ${lib.escapeShellArgs paths}; do
          if [ -d "$p" ]; then
            mkdir -p "/persistent$(dirname "$p")"
            cp -a "$p" "/persistent$(dirname "$p")/" || fail "cannot copy $p"
          fi
        done
        echo "made persistent on $part"
      fi

      if ! mountpoint -q /persistent; then
        if [ ! -e /dev/mapper/userdata_crypt ]; then
          key=$(mktemp -p /run)
          CRYPTTAB_SOURCE=$part ${pkgs.runtimeShell} ${luksKey} > "$key"
          cryptsetup open --key-file "$key" "$part" userdata_crypt
          rm -f "$key"
        fi
        [ -e /dev/mapper/userdata_cryptp1 ] || kpartx -a -p p /dev/mapper/userdata_crypt
        udevadm settle
        mkdir -p /persistent
        mount /dev/mapper/userdata_cryptp1 /persistent
      fi
      for p in ${lib.escapeShellArgs paths}; do
        mkdir -p "$p" "/persistent$p"
        mountpoint -q "$p" || mount --bind "/persistent$p" "$p"
      done
    '';
  };
}
