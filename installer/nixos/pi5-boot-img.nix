# Pi 5 boot from a single boot.img ramdisk, the layout Raspberry Pi secure
# boot verifies (usbboot docs/secure-boot.md).
#
# The boot partition holds only:
#   config.txt     boot_ramdisk=1: the firmware loads boot.img whole and
#                  reads everything else from inside it
#   boot.img       FAT32 image: config.txt, cmdline.txt, kernel.img, initrd,
#                  the bcm2712 device trees and overlays
#   boot.sig       when signed: rpi-eeprom-digest signature of boot.img,
#                  checked against the key in OTP once secure boot is locked
#   tryboot.img/.sig/.system   a new system waiting for its first boot
#
# boot.img is built from the system's store paths alone (fixed timestamps,
# sorted copy order, invariant mkfs), so the build host and the device make
# the same bytes: a signature made on the build host, where the key stays,
# matches the image the device builds when it installs that system.
#
# Updates use the firmware's tryboot: switch-to-configuration stages the new
# boot.img as tryboot.img and arms a one-time "0 tryboot" reboot. Once that
# system is up (spr-api running), spr-boot-commit makes it boot.img. If it
# doesn't come up, the next reset boots the previous boot.img again.
{ config, lib, pkgs, ... }:

let
  cfg = config.spr.bootImg;
  fw = config.boot.loader.raspberry-pi.firmwarePath;
  toplevel = config.system.build.toplevel;

  # the boot partition's own config.txt
  outerConfig = pkgs.writeText "config.txt" ''
    # Raspberry Pi 5: boot from boot.img (verified with boot.sig under
    # secure boot). The system's config.txt is inside boot.img.
    boot_ramdisk=1
  '';

  # spr-make-boot-img <system> <output>
  # Linked into each system, so installing an older generation rebuilds its
  # boot.img with the same script and tools it was signed with.
  makeBootImg = pkgs.writeShellApplication {
    name = "spr-make-boot-img";
    runtimeInputs = with pkgs; [ coreutils findutils dosfstools mtools ];
    text = ''
      system=$(readlink -f "$1")
      out=$2
      # FAT stores local time; fixed zone and sort order for the same bytes.
      # mtools dates new directories from SOURCE_DATE_EPOCH (2000-01-01)
      export TZ=UTC LC_ALL=C SOURCE_DATE_EPOCH=946684800

      stage=$(mktemp -d)
      trap 'rm -rf "$stage"' EXIT
      cp "$system/kernel" "$stage/kernel.img"
      cp "$system/initrd" "$stage/initrd"
      cp "$system/boot-config.txt" "$stage/config.txt"
      echo "$(cat "$system/kernel-params") init=$system/init" > "$stage/cmdline.txt"
      cp "$system"/dtbs/broadcom/bcm2712*.dtb "$stage/"
      mkdir "$stage/overlays"
      cp "$system"/dtbs/overlays/* "$stage/overlays/"
      find "$stage" -type f -exec chmod 0444 {} +
      find "$stage" -exec touch -d '2000-01-01 00:00:00' {} +

      # 512-byte clusters keep the image small; FAT32 (the format the
      # firmware docs recommend) needs at least 65525 of them, ~33 MiB
      kib=$(du -s --apparent-size --block-size=1K "$stage" | cut -f1)
      files=$(find "$stage" | wc -l)
      size=$((kib + kib / 50 + files + 1024))
      [ "$size" -ge 34816 ] || size=34816

      rm -f "$out"
      truncate -s "''${size}K" "$out"
      mkfs.vfat -F 32 -s 1 -S 512 -n SPR-BOOT -i 53505242 --invariant "$out" >/dev/null
      # one file at a time in sorted order, as nixpkgs' sd-image does, so
      # directory entries and clusters land the same way on every build
      cd "$stage"
      find . -mindepth 1 -type d | sort | while read -r d; do
        mmd -i "$out" "::/$d"
      done
      find . -type f | sort | while read -r f; do
        mcopy -pm -i "$out" "$f" "::/$f"
      done
      fsck.vfat -n "$out" >/dev/null
    '';
  };

  # system.build.installBootLoader, run by switch-to-configuration with the
  # system being installed
  installer = pkgs.writeShellApplication {
    name = "spr-install-boot-img";
    runtimeInputs = with pkgs; [ coreutils ];
    text = ''
      system=$(readlink -f "$1")
      name=$(basename "$system")
      [ -x "$system/spr-make-boot-img" ] || {
        echo "error: $system has no spr-make-boot-img (built before the boot.img layout)" >&2
        exit 1
      }

      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"; rm -f "${fw}"/.*.tmp' EXIT
      "$system/spr-make-boot-img" "$system" "$tmp/boot.img"
      sha=$(sha256sum "$tmp/boot.img" | cut -d' ' -f1)
      echo "boot.img for $name: sha256 $sha"

      # boot.sig from the build host (update.sh), first line is the sha256
      sig=${cfg.sigDir}/$name.sig
      if [ -e "$sig" ]; then
        if [ "$(head -n1 "$sig")" != "$sha" ]; then
          echo "error: $sig does not match this boot.img" >&2
          exit 1
        fi
        cp "$sig" "$tmp/boot.sig"
      elif ${lib.boolToString cfg.requireSignature}; then
        echo "error: no signature for $name in ${cfg.sigDir}" >&2
        exit 1
      fi
      echo "$system" > "$tmp/boot.system"

      # copy onto the boot partition, then rename into place
      put() {
        cp "$1" "${fw}/.$2.tmp"
        sync "${fw}/.$2.tmp"
        mv -f "${fw}/.$2.tmp" "${fw}/$2"
      }
      # install as <prefix>.img/.sig/.system; the image goes last, so a
      # half-done install leaves the previous image with a mismatched sig
      # (refused under secure boot) rather than a new image with an old sig
      install_as() {
        if [ -e "$tmp/boot.sig" ]; then put "$tmp/boot.sig" "$1.sig"; else rm -f "${fw}/$1.sig"; fi
        put "$tmp/boot.system" "$1.system"
        put "$tmp/boot.img" "$1.img"
      }
      unstage() {
        rm -f "${fw}"/tryboot.img "${fw}"/tryboot.sig "${fw}"/tryboot.system
        if [ "$(cat /run/systemd/reboot-param 2>/dev/null)" = "0 tryboot" ]; then
          rm -f /run/systemd/reboot-param
        fi
      }

      mkdir -p "${fw}"
      if ! cmp -s ${outerConfig} "${fw}/config.txt"; then put ${outerConfig} config.txt; fi

      current=$(sha256sum "${fw}/boot.img" 2>/dev/null | cut -d' ' -f1 || true)
      if [ "$sha" = "$current" ]; then
        echo "boot.img unchanged"
        # a new signature for the same image
        if [ -e "$tmp/boot.sig" ] && ! cmp -s "$tmp/boot.sig" "${fw}/boot.sig"; then
          put "$tmp/boot.sig" boot.sig
        fi
        unstage
      elif ${lib.boolToString cfg.tryboot} && [ -n "$current" ]; then
        install_as tryboot
        # systemd-shutdown passes this to reboot(2); the Pi firmware boots
        # tryboot.img once, and only for that reboot
        echo "0 tryboot" > /run/systemd/reboot-param
        echo "staged as tryboot.img: the next reboot tries it once; spr-boot-commit makes it boot.img after it boots"
      else
        install_as boot
        unstage
      fi

      # signatures for systems no longer in the profile
      for s in "${cfg.sigDir}"/*.sig; do
        [ -e "$s" ] || continue
        keep=
        for g in /nix/var/nix/profiles/system-*-link; do
          [ "$(basename "$(readlink -f "$g")").sig" = "$(basename "$s")" ] && keep=1
        done
        [ -n "$keep" ] || [ "$s" = "$sig" ] || rm -f "$s"
      done
    '';
  };
in
{
  options.spr.bootImg = {
    enable = lib.mkEnableOption "Pi 5 boot from a single (signable) boot.img";
    tryboot = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Stage new systems as tryboot.img and make them boot.img only after
        they boot, instead of replacing boot.img directly.
      '';
    };
    sigDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/spr-boot/sigs";
      description = "Where update.sh puts boot.img signatures, as <system name>.sig.";
    };
    requireSignature = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Refuse to install a boot.img without a matching signature. Turn on
        once the device's OTP holds the signing key: an unsigned boot.img
        won't boot then anyway.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    # the image's own config.txt: no per-generation os_prefix, files are at
    # the root of boot.img
    hardware.raspberry-pi.config.all.options.os_prefix.enable = lib.mkForce false;

    system.extraSystemBuilderCmds = ''
      ln -s ${config.boot.loader.raspberry-pi.configTxtPackage} $out/boot-config.txt
      ln -s ${makeBootImg}/bin/spr-make-boot-img $out/spr-make-boot-img
    '';

    system.build.installBootLoader = lib.mkForce "${installer}/bin/spr-install-boot-img";
    system.boot.loader.id = lib.mkForce "spr-boot-img";

    # built on the build host: sd-image copies it, update.sh signs it
    system.build.bootImg = pkgs.runCommand "spr-boot-img" { } ''
      mkdir $out
      ${toplevel}/spr-make-boot-img ${toplevel} $out/boot.img
      sha256sum $out/boot.img | cut -d' ' -f1 > $out/sha256
      ln -s ${toplevel} $out/system
    '';

    sdImage.populateFirmwareCommands = lib.mkForce ''
      cp ${outerConfig} firmware/config.txt
      cp ${config.system.build.bootImg}/boot.img firmware/boot.img
      echo ${toplevel} > firmware/boot.system
    '';

    systemd.tmpfiles.rules = [ "d ${cfg.sigDir} 0700 root root -" ];

    # a kernel panic while trying a new boot.img resets into the old one
    boot.kernelParams = [ "panic=10" ];

    systemd.services.spr-boot-commit = lib.mkIf cfg.tryboot {
      description = "Make a tryboot-staged boot.img the default once it has booted";
      wantedBy = [ "multi-user.target" ];
      after = [ "multi-user.target" "spr-api.service" ];
      path = [ pkgs.coreutils pkgs.systemd ];
      serviceConfig.Type = "oneshot";
      script = ''
        [ -e ${fw}/tryboot.system ] || exit 0
        staged=$(cat ${fw}/tryboot.system)
        booted=$(readlink -f /run/booted-system)
        if [ "$staged" != "$booted" ]; then
          echo "tryboot.img ($staged) did not boot; boot.img stays the default"
          exit 0
        fi
        if ! systemctl is-active -q spr-api; then
          echo "spr-api is not running; not committing $staged"
          exit 1
        fi
        # sig before image, as in the installer
        if [ -e ${fw}/tryboot.sig ]; then mv -f ${fw}/tryboot.sig ${fw}/boot.sig; else rm -f ${fw}/boot.sig; fi
        mv -f ${fw}/tryboot.system ${fw}/boot.system
        mv -f ${fw}/tryboot.img ${fw}/boot.img
        sync -f ${fw}/boot.img
        echo "committed $staged as boot.img"
      '';
    };
  };
}
