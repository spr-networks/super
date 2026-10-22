{
  description = "SPR - Secure Programmable Router (NixOS native)";

  inputs = {
    # same release as nixos-raspberrypi, which follows it: one nixpkgs in the image
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-utils.url = "github:numtide/flake-utils";

    # Pi 5 / CM5 NixOS support (community flake — vendor kernel, proper config.txt,
    # working bootloader, all the Pi 5 hardware quirks handled).
    nixos-raspberrypi = {
      url = "github:nvmd/nixos-raspberrypi/main";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, nixos-raspberrypi }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];

      # Build inputs, both written by ./update-pins.sh:
      # - reproducible.env: the commits and versions the Docker build uses
      #   (shared, so the two builds can't drift apart)
      # - pins.json: what only Nix needs: the SPR kernel release, the UI
      #   image and the Nix hashes for all of it
      env = builtins.listToAttrs (map (m: { name = builtins.elemAt m 0; value = builtins.elemAt m 1; })
        (builtins.filter (m: m != null)
          (map (builtins.match "([A-Z0-9_]+)=(.*)")
            (nixpkgs.lib.splitString "\n" (builtins.readFile ../../reproducible.env)))));
      pins = builtins.fromJSON (builtins.readFile ./pins.json);

      # SPR's service binaries from the super_* images and the release's
      # krun .deb, which fetch-images.sh verified (cosign) into SPR_IMAGES:
      # build with --impure (build-image.sh, update.sh)
      sprImages = let dir = builtins.getEnv "SPR_IMAGES"; in
        if dir == "" then throw "SPR_IMAGES is unset: build with installer/nixos/build-image.sh"
        else builtins.path { path = dir; name = "spr-images"; };
      sprImagesTag = nixpkgs.lib.removeSuffix "\n" (builtins.readFile "${sprImages}/tag");

      # SPR's packages for a package set: each system's own nixpkgs for
      # packages.<system>, and the system's pkgs in the NixOS configurations,
      # so a cross build (spr-aarch64-cross) cross-compiles them too
      sprFor = pkgs:
      let
        system = pkgs.stdenv.hostPlatform.system;

        # Placeholder hash — nix will error with the correct hash on first build.
        # Replace each one as you go: nix build .#spr-api 2>&1 | grep 'got:'
        fakeHash = pkgs.lib.fakeHash;

        goLdflags = "-s -w";

        # the Go release of the Docker build (GO_VERSION): nixpkgs' go of
        # that line, built from that release's source, as nixpkgs can lag
        # behind it (security fixes)
        goMinor = nixpkgs.lib.versions.majorMinor env.GO_VERSION;
        go = pkgs."go_${builtins.replaceStrings [ "." ] [ "_" ] goMinor}".overrideAttrs (old: {
          version = env.GO_VERSION;
          src = pkgs.fetchurl {
            url = "https://go.dev/dl/go${env.GO_VERSION}.src.tar.gz";
            hash = pins.go;
          };
        });
        buildGoModule = pkgs."buildGo${builtins.replaceStrings [ "." ] [ "" ] goMinor}Module".override { inherit go; };

        # sources at pinned commits
        sources = builtins.mapAttrs (name: src: pkgs.fetchFromGitHub (src // {
          hash = pins.src.${name};
        })) {
          # MediaTek firmware, at installer/raspbian/scripts/pi-target-install.sh's commits
          mt76 = { owner = "openwrt"; repo = "mt76"; rev = "65bbd4c394a9d51f1ca5a0531166c22ff07d4e56"; };
          mt76-mt7996 = { owner = "openwrt"; repo = "mt76"; rev = "018f60316d4dd6b4e741874eda40e2dfaa29df3b"; };
        };

        # ================================================================
        #  SPR's services: the published super_* images
        # ================================================================

        # The same builds the docker install runs (fetch-images.sh): files
        # (out path = path in the image), the dynamically linked ones (libs)
        # relinked against nixpkgs
        fromImage = { pname, image, files, libs ? [ ], description }: pkgs.stdenv.mkDerivation {
          inherit pname;
          version = sprImagesTag;
          dontUnpack = true;
          nativeBuildInputs = [ pkgs.autoPatchelfHook ];
          buildInputs = libs;
          installPhase = pkgs.lib.concatStrings (pkgs.lib.mapAttrsToList (out: path: ''
            install -D${if pkgs.lib.hasPrefix "bin/" out then "m755" else "m644"} ${sprImages}/${image}/${path} $out/${out}
          '') files);
          # as built: the Go binaries are stripped, the eBPF object must not be
          dontStrip = true;
          meta.description = description;
        };

        spr-api = fromImage {
          pname = "spr-api"; image = "api";
          files."bin/api" = "api";
          description = "SPR REST API server";
        };
        spr-sprbus-cli = fromImage {
          pname = "spr-sprbus-cli"; image = "api";
          files."bin/sprbus" = "sprbus";
          description = "SPR sprbus debug CLI/TUI";
        };
        spr-db = fromImage {
          pname = "spr-db"; image = "db";
          files."bin/boltapi" = "boltapi";
          description = "SPR database (BoltDB) service";
        };
        spr-dhcp = fromImage {
          pname = "spr-dhcp"; image = "dhcp";
          files = { "bin/coredhcpd" = "coredhcpd"; "bin/coredhcp_client" = "coredhcp_client"; };
          description = "SPR CoreDHCP server (spr-networks fork)";
        };
        spr-dns = fromImage {
          pname = "spr-dns"; image = "dns";
          files."bin/coredns" = "coredns";
          description = "SPR CoreDNS with custom plugins";
        };
        spr-dyndns = fromImage {
          pname = "spr-dyndns"; image = "dyndns";
          files."bin/dyndns_plugin" = "dyndns_plugin";
          description = "SPR dynamic DNS plugin";
        };
        spr-godns = fromImage {
          pname = "godns"; image = "dyndns";
          files."bin/godns" = "godns";
          description = "godns dynamic DNS client";
        };
        spr-multicast-proxy = fromImage {
          pname = "spr-multicast-proxy"; image = "multicast_udp_proxy";
          files."bin/multicastproxy" = "code/multicastproxy";
          description = "SPR multicast UDP proxy";
        };
        spr-packet-logs = fromImage {
          pname = "spr-packet-logs"; image = "packet_logs";
          files."bin/packet_logs" = "packet_logs";
          description = "SPR packet logging service";
        };
        spr-plugin-lookup = fromImage {
          pname = "spr-plugin-lookup"; image = "plugin-lookup";
          files."bin/lookup_plugin" = "lookup_plugin";
          description = "SPR plugin lookup (IP/ASN) service";
        };
        spr-wireguard = fromImage {
          pname = "spr-wireguard"; image = "wireguard";
          files."bin/wireguard_plugin" = "wireguard_plugin";
          description = "SPR WireGuard plugin";
        };
        # SPR's hostap fork, with wifid/code/hostapd_config
        spr-hostapd = fromImage {
          pname = "spr-hostapd"; image = "wifid";
          files = { "bin/hostapd" = "usr/local/bin/hostapd"; "bin/hostapd_cli" = "usr/local/bin/hostapd_cli"; };
          libs = with pkgs; [ openssl libnl ];
          description = "SPR custom hostapd (spr-networks fork)";
        };
        spr-wifid-helper = fromImage {
          pname = "spr-wifid-helper"; image = "wifid";
          files."bin/hostap_dhcp_helper" = "hostap_dhcp_helper";
          description = "SPR WiFi DHCP helper (nft dhcp_access manager)";
        };
        spr-wifid-ebpf = fromImage {
          pname = "spr-wifid-ebpf"; image = "wifid";
          files."lib/filter_dhcp_mismatch.o" = "code/filter_dhcp_mismatch.o";
          description = "SPR eBPF DHCP mismatch filter";
        };
        # the image's Ubuntu wpasupplicant (wifi_uplink/Dockerfile), with the
        # upstream socket paths wifi_uplink's scripts use
        spr-wpa-supplicant = fromImage {
          pname = "spr-wpa-supplicant"; image = "wifiuplink";
          files = { "bin/wpa_supplicant" = "usr/sbin/wpa_supplicant"; "bin/wpa_cli" = "usr/sbin/wpa_cli"; };
          libs = with pkgs; [ libnl pcsclite.lib openssl dbus.lib readline ];
          description = "wpa_supplicant of the SPR WiFi uplink";
        };
        # the UI the docker install copies out of /app/build
        spr-frontend = pkgs.runCommand "spr-frontend-${sprImagesTag}" {
          meta.description = "SPR web frontend";
        } ''
          cp -r ${sprImages}/frontend/app/build $out
        '';

        # ================================================================
        #  Built here
        # ================================================================

        spr-superd = buildGoModule {
          pname = "spr-superd";
          version = "0-unstable";
          # the systemd-native superd: its own module, kept apart from the
          # docker superd (superd/code) so NixOS work can't change it
          src = ../../superd/nixos;
          subPackages = [ "." ];
          vendorHash = pins.vendorHash.spr-superd;
          env.CGO_ENABLED = "0";
          ldflags = [ goLdflags ];
          postInstall = "mv $out/bin/nixos $out/bin/superd";
          meta.description = "SPR supervisor daemon";
        };

        spr-flowgather = buildGoModule {
          pname = "spr-flowgather";
          version = "0-unstable";
          src = ../../flowgather/code;
          vendorHash = fakeHash;
          buildInputs = [ pkgs.libpcap ];
          ldflags = [ goLdflags ];
          # TODO: upstream has gopacket API mismatch (google/gopacket vs gopacket/gopacket)
          meta.broken = true;
          meta.description = "SPR flow gather service";
        };

        # oxwifid release (OXWIFID_*), as in the wifid/ and wifi_uplink/ Dockerfiles:
        # barely-ap (wifid rust AP) and barely-cli (wifi_uplink rust client).
        # Only published for aarch64; elsewhere install stubs like the Dockerfiles.
        spr-oxwifid = if system == "aarch64-linux" then pkgs.stdenv.mkDerivation {
          pname = "oxwifid";
          version = env.OXWIFID_VERSION;
          src = pkgs.fetchurl {
            url = env.OXWIFID_ARM64_URL;
            sha256 = env.OXWIFID_ARM64_ARCHIVE_SHA256;
          };
          installPhase = ''
            install -Dm755 barely-ap $out/bin/barely-ap
            install -Dm755 barely-cli $out/bin/barely-cli
            echo "${env.OXWIFID_BARELY_AP_ARM64_SHA256}  $out/bin/barely-ap" | sha256sum -c -
            echo "${env.OXWIFID_BARELY_CLI_ARM64_SHA256}  $out/bin/barely-cli" | sha256sum -c -
          '';
          dontStrip = true;
          dontPatchELF = true;
          meta.platforms = [ "aarch64-linux" ];
        } else pkgs.runCommand "oxwifid-unavailable" {} ''
          mkdir -p $out/bin
          for b in barely-ap barely-cli; do
            printf '#!/bin/sh\necho "oxwifid is unavailable on ${system}" >&2\nexit 1\n' > $out/bin/$b
            chmod +x $out/bin/$b
          done
        '';

        # xdp-tools from nixpkgs (provides xdp-loader)
        # wifid only needs xdp-loader (main's wifid image takes it from the
        # distro xdp-tools package); the full output pulls in gcc through
        # share/xdp-tools/test-tool
        spr-xdp-loader = pkgs.runCommand "spr-xdp-loader-${pkgs.xdp-tools.version}" {
          nativeBuildInputs = [ pkgs.removeReferencesTo ];
        } ''
          install -Dm755 ${pkgs.xdp-tools}/bin/xdp-loader $out/bin/xdp-loader
          # header paths in assert messages, which pull in glibc-dev
          remove-references-to -t ${pkgs.stdenv.cc.libc.dev} $out/bin/xdp-loader
        '';

        # git for the API, which only runs `git ls-remote https://...`
        # (PLUS token check): the git binary and its https helper, without
        # gitMinimal's other helpers, scripts and gettext (~70 MiB)
        spr-git = pkgs.runCommand "spr-git-${pkgs.gitMinimal.version}" {
          nativeBuildInputs = [ pkgs.removeReferencesTo pkgs.makeWrapper ];
        } ''
          core=$out/libexec/git-core
          mkdir -p $core
          cp ${pkgs.gitMinimal}/libexec/git-core/git $core/
          cp ${pkgs.gitMinimal}/libexec/git-core/git-remote-http $core/
          ln -s git-remote-http $core/git-remote-https
          chmod u+w $core/*
          remove-references-to -t ${pkgs.gitMinimal} $core/git $core/git-remote-http
          makeWrapper $core/git $out/bin/git --set GIT_EXEC_PATH $core
        '';

        # pppd of the super_ppp image (Ubuntu's ppp, ppp/Dockerfile) and the
        # PPPoE plugin the API configures (`plugin rp-pppoe.so`,
        # api/code/uplink.go). pppd loads plugins from /usr/lib/pppd/<version>:
        # spr-ppp's unit binds lib/pppd there.
        spr-ppp = pkgs.stdenv.mkDerivation {
          pname = "spr-ppp";
          version = sprImagesTag;
          dontUnpack = true;
          nativeBuildInputs = [ pkgs.autoPatchelfHook ];
          buildInputs = with pkgs; [ openssl libxcrypt-legacy pam systemdLibs libpcap ];
          installPhase = ''
            install -Dm755 ${sprImages}/ppp/usr/sbin/pppd $out/bin/pppd
            # Debian's soname for libpcap 1.x
            patchelf --replace-needed libpcap.so.0.8 libpcap.so.1 $out/bin/pppd
            for dir in ${sprImages}/ppp/usr/lib/pppd/*; do
              mkdir -p $out/lib/pppd/$(basename $dir)
              cp -L $dir/pppoe.so $dir/rp-pppoe.so $out/lib/pppd/$(basename $dir)/
            done
          '';
          dontStrip = true;
          meta.description = "pppd of the SPR PPP uplink";
        };

        # linux-firmware cut down to the hardware SPR supports:
        # Pi 4/5 + CM4/CM5 onboard WiFi/BT, ath12k, mt7915/mt7916/mt7996/mt7925,
        # mt76 USB, r8125, iwlwifi AX210/BE200
        spr-firmware = pkgs.runCommand "spr-firmware" {
          nativeBuildInputs = [ pkgs.kmod ];
        } ''
          dst=$out/lib/firmware
          # keep <dir> <patterns>: copy what the patterns match in <dir>.
          # They are expanded there, not here: stdenv sets nullglob, which
          # would drop a pattern that matches nothing in the build directory.
          set -f
          keep() {
            (cd "$1" && shift && set +f && for f in $@; do
              [ -e "$f" ] || [ -L "$f" ] || continue
              mkdir -p "$dst/$(dirname "$f")"; cp -a --remove-destination "$f" "$dst/$f"
            done)
          }
          lf=${pkgs.linux-firmware}/lib/firmware
          # Pi onboard CYW43455 (Pi 4/5, CM4/CM5) and 43456 (Pi 400) WiFi + BT
          keep $lf brcm/brcmfmac43455-sdio.* brcm/brcmfmac43456-sdio.* \
               brcm/BCM4345C0.* brcm/BCM4345C5.* cypress/cyfmac43455-sdio.* \
               cypress/cyfmac43456-sdio.*
          # Qualcomm WiFi 7
          keep $lf ath12k
          # MediaTek mt7915/mt7916/mt7996, mt7925, mt7921 and mt76 USB adapters
          keep $lf mediatek/mt7915_* mediatek/mt7916_* mediatek/mt7996 mediatek/mt7925 \
               mediatek/WIFI_MT7961_* mediatek/WIFI_RAM_CODE_MT7961_* \
               mediatek/BT_RAM_CODE_MT7961_* mediatek/mt7610u.bin mediatek/mt7610e.bin \
               mediatek/mt7662u.bin mediatek/mt7662u_rom_patch.bin \
               mediatek/mt7663* mediatek/mt7601u.bin mt7601u.bin
          # Realtek r8125 2.5GbE
          keep $lf rtl_nic/rtl8125*
          # Intel AX210 (ty-a0-gf-a0) and BE200 (gl-c0-fm-c0) WiFi + BT. Of
          # the ucode versions, only the one the kernel's iwlwifi loads: it
          # declares its newest and falls back in order, -cN (core) names
          # down to -c99, then -N (API) names from 101 down (iwl-drv.c).
          keep $lf intel/ibt-0041-0041.* intel/ibt-0291-0291.*
          iwl=$(find ${spr-kernel-prebuilt} -name 'iwlwifi.ko*' | head -1)
          for pre in iwlwifi-ty-a0-gf-a0 iwlwifi-gl-c0-fm-c0; do
            newest=$(modinfo -F firmware $iwl | grep "^$pre-.*\.ucode$")
            n=''${newest#$pre-}; n=''${n%.ucode}
            case $n in
              c*) order="$(seq -f "c%g" ''${n#c} -1 99) $(seq 101 -1 1)" ;;
              *) order=$(seq $n -1 1) ;;
            esac
            ucode=
            for v in $order; do
              [ -e $lf/$pre-$v.ucode ] && { ucode=$pre-$v.ucode; break; }
            done
            [ -n "$ucode" ] || { echo "no $pre ucode for $newest" >&2; exit 1; }
            keep $lf $ucode $pre.pnvm
          done
          chmod -R u+w $dst
          # follow symlinks that point at files we did not copy
          (cd $dst && find . -xtype l | while read -r l; do
            [ -e "$(readlink -f "$lf/$l")" ] && { rm "$l"; cp -L "$lf/$l" "$l"; } || rm "$l"
          done)
          # the Pi's own CYW43455/43456 firmware, nvram and CLM blob: upstream
          # linux-firmware has no nvram for the Pi 5 and CM5
          keep ${pkgs.raspberrypiWirelessFirmware}/lib/firmware \
               brcm/brcmfmac43455* brcm/brcmfmac43456* brcm/BCM4345C0* brcm/BCM4345C5* \
               cypress/cyfmac43455* cypress/cyfmac43456*
          # openwrt mt76 firmware over linux-firmware's, then newer mt7996
          # firmware over that, as on Raspbian (pi-target-install.sh)
          set +f
          chmod -R u+w $dst
          mkdir -p $dst/mediatek/mt7996
          (cd ${sources.mt76}/firmware && cp -f mt7915* mt7916* $dst/mediatek/ &&
            cp -rf mt7996/. $dst/mediatek/mt7996/)
          cp -f ${sources.mt76-mt7996}/firmware/mt7996/* $dst/mediatek/mt7996/
          chmod -R u+w $dst
        '';

        # ================================================================
        #  SPR Kernel (Raspberry Pi 5, aarch64)
        # ================================================================

        # Prebuilt kernel from the latest spr-debian-kernel release (pins.json).
        # Made compatible with NixOS's linuxPackagesFor by exposing all the
        # attributes the kernel infrastructure expects (override, passthru.config,
        # passthru.kernelOlder/At, modDirVersion, etc.).
        spr-kernel-prebuilt = let
          inherit (pins.kernel) version modDirVersion;

          unpacked = pkgs.stdenv.mkDerivation {
            pname = "spr-kernel-unpacked";
            inherit version;
            src = pkgs.fetchurl { inherit (pins.kernel) url hash; };
            nativeBuildInputs = [ pkgs.dpkg ];
            unpackPhase = "dpkg-deb -x $src .";
            installPhase = ''
              mkdir -p $out
              cp boot/vmlinuz-* $out/Image
              cp boot/config-* $out/config
              cp boot/System.map-* $out/System.map
              cp -r lib/modules/${modDirVersion} $out/modules
              # device trees and overlays built with this kernel
              cp -r usr/lib/linux-image-${modDirVersion} $out/dtbs
            '';
            meta.platforms = [ "aarch64-linux" ];
          };

          # Parse the actual kernel config into the isYes/isNo/etc functions
          # NixOS expects on passthru.config.
          parseConfig = configFile: let
            text = builtins.readFile configFile;
            lines = pkgs.lib.splitString "\n" text;
            extract = line:
              let m = builtins.match "CONFIG_([A-Z0-9_]+)=(.*)" line;
              in if m == null then null else { name = builtins.elemAt m 0; value = builtins.elemAt m 1; };
            entries = builtins.filter (x: x != null) (map extract lines);
            options = builtins.listToAttrs (map (e: { inherit (e) name; value = e.value; }) entries);
          in {
            inherit options;
            isYes = name: (options.${name} or null) == "y";
            isNo = name: !(builtins.hasAttr name options);
            isModule = name: (options.${name} or null) == "m";
            isEnabled = name: builtins.hasAttr name options;
            isDisabled = name: !(builtins.hasAttr name options);
            # used by the systemd initrd
            isSet = name: builtins.hasAttr name options;
            getValue = name: options.${name} or null;
          };

          # The kernel derivation — must look enough like a "real" NixOS
          # kernel that linuxPackagesFor will accept it. Accept any override
          # args (features, structuredExtraConfig, etc.) and ignore them.
          makeKernel = { features ? {}, randstructSeed ? "",
                         extraMakeFlags ? [], structuredExtraConfig ? {},
                         ... }: pkgs.stdenv.mkDerivation {
            pname = "linux";  # nixpkgs expects this name
            inherit version;
            dontUnpack = true;
            installPhase = ''
              mkdir -p $out/lib/modules/${modDirVersion}
              cp -r ${unpacked}/modules/* $out/lib/modules/${modDirVersion}/
              cp ${unpacked}/Image $out/
              cp ${unpacked}/config $out/
              touch $out/lib/modules/${modDirVersion}/modules.{builtin,order,dep,alias,symbols,devname,softdep}

              # broadcom/*.dtb and overlays/ from the kernel deb (kernel.dtbs
              # is where NixOS and pi5-boot-img.nix look for them)
              cp -r ${unpacked}/dtbs $out/dtbs
            '';
            # These three must be top-level (not in passthru) — nixpkgs's
            # linux-kernels.nix accesses kernel.commonMakeFlags directly.
            commonMakeFlags = [];
            makeFlags = [];
            stdenv = pkgs.stdenv;
            passthru = {
              inherit modDirVersion version;
              kernelOlder = v: pkgs.lib.versionOlder version v;
              kernelAtLeast = v: pkgs.lib.versionAtLeast version v;
              isHardened = false;
              isLibre = false;
              isZen = false;
              isLongTerm = false;
              isXanmod = false;
              kernelArch = "arm64";
              features = {};
              stdenv = pkgs.stdenv;
              configfile = "${unpacked}/config";
              config = parseConfig "${unpacked}/config";
              moduleBuildDependencies = [];
              baseVersion = pkgs.lib.head (pkgs.lib.splitString "-" version);
              kernelPatches = [];
              src = unpacked;
              dev = unpacked;
            };
            meta.platforms = [ "aarch64-linux" ];
            meta.description = "SPR kernel (prebuilt from GitHub release)";
          };
        in pkgs.lib.makeOverridable makeKernel { };

        # KVM plugin runtime (host-packages/spr-krun-runtime)
        spr-krun-runtime = import ./spr-krun-runtime.nix {
          inherit pkgs;
          inherit (pkgs) lib;
          deb = "${sprImages}/krun/spr-krun-runtime.deb";
          version = pkgs.lib.removeSuffix "\n" (builtins.readFile "${sprImages}/krun/version");
        };

      in {
        packages = {
          inherit spr-krun-runtime;
          inherit spr-api spr-db spr-multicast-proxy spr-packet-logs
                  spr-plugin-lookup spr-wireguard spr-superd spr-flowgather
                  spr-wifid-helper spr-sprbus-cli spr-dhcp spr-dns spr-hostapd
                  spr-dyndns spr-godns spr-oxwifid
                  spr-firmware spr-ppp
                  spr-wifid-ebpf spr-xdp-loader spr-git spr-frontend spr-wpa-supplicant
                  spr-kernel-prebuilt;
          default = spr-api;
        };

        # for ../../update-pins.sh, which checks each pins.json hash by
        # building what it covers
        legacyPackages = { inherit sources; };

        # Smoke test: verify all packages build and the NixOS module evaluates.
        # This runs everywhere (including Docker on macOS).
        checks.spr-smoke = pkgs.runCommand "spr-smoke-test" {} ''
          echo "Verifying all SPR packages are built and binaries exist..."
          test -x ${spr-api}/bin/api
          test -x ${spr-superd}/bin/superd
          test -x ${spr-db}/bin/boltapi
          test -x ${spr-dhcp}/bin/coredhcpd
          test -x ${spr-dns}/bin/coredns
          test -x ${spr-packet-logs}/bin/packet_logs
          test -x ${spr-wireguard}/bin/wireguard_plugin
          test -x ${spr-multicast-proxy}/bin/multicastproxy
          test -x ${spr-plugin-lookup}/bin/lookup_plugin
          test -x ${spr-wifid-helper}/bin/hostap_dhcp_helper
          test -x ${spr-hostapd}/bin/hostapd
          test -f ${spr-wifid-ebpf}/lib/filter_dhcp_mismatch.o
          ${spr-dns}/bin/coredns -plugins > /dev/null 2>&1
          ${spr-hostapd}/bin/hostapd -v 2>&1 || true
          echo "All 12 SPR binaries verified." > $out
        '';

        # Full VM integration test: boots NixOS in QEMU, verifies services.
        # Requires KVM — only works on native Linux, not Docker-on-macOS.
        # Run: nix build .#checks.<system>.spr-vm-test
        checks.spr-vm-test = pkgs.testers.nixosTest {
          name = "spr-integration";

          nodes.router = { config, pkgs, ... }: {
            imports = [ self.nixosModules.default ];

            services.spr = {
              enable = true;
              wanInterface = "eth1";
              lanIP = "192.168.2.1";
              enableWifi = false;
              enableWireguard = true;
              enableDB = true;
              enablePacketLogs = false;
              enablePluginLookup = false;
              enableMulticastProxy = false;
            };

            virtualisation.vlans = [ 1 ];
          };

          testScript = ''
            router.start()
            router.wait_for_unit("spr-base.service")
            router.wait_for_unit("spr-dhcp.service")
            router.wait_for_unit("spr-dns.service")
            router.wait_for_unit("spr-api.service")
            router.wait_for_unit("spr-db.service")
            router.wait_for_unit("spr-wireguard.service")

            # Verify sprloop interface exists with the LAN IP
            router.succeed("ip addr show sprloop | grep 192.168.2.1")

            # Verify nftables rules are loaded
            router.succeed("nft list table inet filter | grep dhcp_access")
            router.succeed("nft list table inet nat | grep PREROUTING")

            # Verify API is listening on port 80
            router.wait_until_succeeds("curl -sf http://192.168.2.1:80/ || curl -sf http://127.0.0.1:80/", timeout=30)

            # Verify DNS is responding
            router.wait_until_succeeds("dig @192.168.2.1 example.com +short +timeout=2", timeout=30)

            # Verify WireGuard interface exists
            router.succeed("ip link show wg0")

            # Verify the services are all active
            router.succeed("systemctl is-active spr-base")
            router.succeed("systemctl is-active spr-dhcp")
            router.succeed("systemctl is-active spr-dns")
            router.succeed("systemctl is-active spr-api")
            router.succeed("systemctl is-active spr-db")
          '';
        };
      };
    in
    flake-utils.lib.eachSystem supportedSystems (system: sprFor (import nixpkgs { inherit system; })) // {
      # ==============================================================
      #  NixOS module
      # ==============================================================
      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.spr;
          sprPkgs = (sprFor pkgs).packages;
          # the system's TLS roots (security.pki), for the services that
          # bind or name a bundle themselves
          cacert = pkgs.cacert.override { blacklist = config.security.pki.caCertificateBlacklist; };

          baseScriptsDir = ../../base/scripts;
          wifidScriptsDir = ../../wifid/scripts;
          pluginLookupScriptsDir = ../../plugin-lookup/scripts;

          # Each SPR service gets a private mount namespace with only its
          # specific paths visible — matching Docker volume mounts exactly.
          # TemporaryFileSystem=/:ro gives an empty root, then BindPaths
          # maps in only what the service needs.
          d = cfg.dataDir;

          # Helpers: map dataDir subpaths to container-style absolute paths
          bp = sub: "${d}/${sub}:/${sub}";
          # BindReadOnlyPaths is already read-only; a ":ro" suffix is an invalid
          # mount option and makes systemd silently drop the whole entry
          bpRo = sub: "${d}/${sub}:/${sub}";

          # Common service config for namespace isolation
          # Each service adds its own BindPaths on top of this.
          sprServiceConfig = {
            # Private root filesystem — service sees empty / plus explicit mounts
            TemporaryFileSystem = "/:ro";
            # Required for any service to run
            BindReadOnlyPaths = [
              "/nix/store"
              "/nix/var"
              "/run"
              "/bin/sh"
              "${pkgs.bash}/bin/bash:/bin/bash"
              # Standard device nodes every process needs
              "/dev/null"
              "/dev/zero"
              "/dev/urandom"
              "/dev/random"
              # name resolution and TLS roots, as the containers had
              "-/etc/resolv.conf"
              "${cacert}/etc/ssl:/etc/ssl"
            ];
            PrivateDevices = true;
            PrivateTmp = true;
            # TemporaryFileSystem=/ leaves out /proc and /sys (the API reads
            # /proc/net/arp, etc.); mount them like a container would
            MountAPIVFS = true;
          };
        in {
          options.services.spr = {
            enable = lib.mkEnableOption "SPR Secure Programmable Router";

            dataDir = lib.mkOption {
              type = lib.types.path;
              default = "/var/lib/spr";
              description = "Root directory for SPR configs and state";
            };

            useCustomKernel = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Use SPR's custom RPi kernel (prebuilt from GitHub release)";
            };

            wanInterface = lib.mkOption {
              type = lib.types.str;
              default = "eth0";
              description = "WAN (upstream/internet) interface";
            };

            lanInterface = lib.mkOption {
              type = lib.types.nullOr lib.types.str;
              default = null;
              description = "Wired LAN interface (optional)";
            };

            lanIP = lib.mkOption {
              type = lib.types.str;
              default = "192.168.2.1";
              description = "LAN IP address for SPR";
            };

            wireguardPort = lib.mkOption {
              type = lib.types.port;
              default = 51280;
              description = "WireGuard listen port";
            };

            enableWireguard = lib.mkOption {
              type = lib.types.bool;
              default = true;
            };

            enableWifi = lib.mkOption {
              type = lib.types.bool;
              default = true;
            };

            enableDB = lib.mkOption {
              type = lib.types.bool;
              default = true;
            };

            enablePacketLogs = lib.mkOption {
              type = lib.types.bool;
              default = false;
            };

            enablePluginLookup = lib.mkOption {
              type = lib.types.bool;
              default = false;
            };

            enableMulticastProxy = lib.mkOption {
              type = lib.types.bool;
              default = false;
            };

            enableWatchdog = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Pet the hardware watchdog (the watchdog container's job)";
            };
          };

          config = lib.mkIf cfg.enable {

            # -- Disable NixOS firewall: SPR owns nftables entirely --
            networking.firewall.enable = false;

            # -- Custom SPR kernel (RPi5) --
            # The prebuilt kernel from spr-debian-kernel is used via
            # boot.kernelPackages with enough shim attributes to satisfy
            # NixOS's kernel infrastructure.
            # Custom SPR kernel: the Pi firmware will boot kernel_2712.img
            # (copied to FAT partition by populateFirmwareCommands). The
            # NixOS-managed kernel below is what userspace tooling references,
            # but the Pi never actually boots it.
            #
            # For now use the stock NixOS aarch64 kernel for compatibility
            # with the kernel module infrastructure. The SPR prebuilt kernel
            # is only used as the actual boot kernel via kernel_2712.img.
            # TODO: integrate SPR kernel modules at /lib/modules/<spr-ver>
            # so loadable modules match the running kernel.


            # eMudhra CA compromise (CVE-2026-114406): the roots that
            # cross-signed its intermediates, until nixpkgs' cacert drops them
            security.pki.caCertificateBlacklist = [
              "emSign ECC Root CA - G3"
              "Comodo AAA Services root"
            ];

            # -- System packages that SPR shell scripts call at runtime --
            environment.systemPackages = with pkgs; [
              nftables
              iptables
              iproute2
              conntrack-tools
              ethtool
              jq
              curl
              wireguard-tools
              iw
              lshw
              procps
              util-linux
              gnugrep
              gnused
              gawk
              coreutils
              bash
              # sprbus CLI looks for $TEST_PREFIX/state/api/eventbus.sock
              (pkgs.writeShellScriptBin "sprbus" ''
                export TEST_PREFIX="''${TEST_PREFIX-${toString cfg.dataDir}}"
                exec ${sprPkgs.spr-sprbus-cli}/bin/sprbus "$@"
              '')
            ] ++ lib.optionals cfg.enableWifi [
              sprPkgs.spr-hostapd
            ];

            # -- Kernel params --
            boot.kernel.sysctl = {
              "net.ipv4.ip_forward" = 1;
              "net.ipv4.conf.all.arp_filter" = 1;
            };

            # -- Disable systemd-resolved (SPR runs its own DNS) --
            services.resolved.enable = false;

            # -- ath12k firmware (WiFi 7 / WiFi 6E) --
            hardware.firmware = lib.mkIf cfg.enableWifi [
              (pkgs.runCommand "spr-ath12k-firmware" {} ''
                mkdir -p $out/lib/firmware/ath12k/WCN7850/hw2.0
                cp ${../../installer/raspbian/firmware/ath12k}/* \
                  $out/lib/firmware/ath12k/WCN7850/hw2.0/
              '')
            ];

            # -- USB WiFi scatter/gather bug workaround --
            boot.extraModprobeConfig = "options mt76_usb disable_usb_sg=1";

            # -- Wireless regulatory domain --
            boot.kernelModules = [ "cfg80211" ];
            environment.etc."default/crda".text = "REGDOMAIN=US";

            # -- Disable predictable network interface names --
            networking.usePredictableInterfaceNames = false;

            # -- udev rules for Pi 5 / CM5 --
            services.udev.extraRules = ''
              # Pi 5 / CM5 PCIe ethernet
              SUBSYSTEM=="net", ACTION=="add", DEVPATH=="*0001:01:00.0*", NAME="eth0"
              SUBSYSTEM=="net", ACTION=="add", DEVPATH=="*0000:03:00.0*", NAME="eth1"
              # brcmfmac (onboard WiFi) → wlan0
              ACTION=="add", SUBSYSTEM=="net", SUBSYSTEMS=="sdio", DRIVERS=="brcmfmac", NAME!="wlan0", RUN+="${pkgs.writeShellScript "wlan0-swap" ''
                if ${pkgs.iproute2}/bin/ip link show wlan0 > /dev/null 2>&1; then
                  ${pkgs.iproute2}/bin/ip link set wlan0 down
                  ${pkgs.iproute2}/bin/ip link set wlan0 name wlan_tmp
                fi
                ${pkgs.iproute2}/bin/ip link set "$1" down
                ${pkgs.iproute2}/bin/ip link set "$1" name wlan0
                ${pkgs.iproute2}/bin/ip link set wlan0 up
                if ${pkgs.iproute2}/bin/ip link show wlan_tmp > /dev/null 2>&1; then
                  ${pkgs.iproute2}/bin/ip link set wlan_tmp name "$1"
                  ${pkgs.iproute2}/bin/ip link set "$1" up
                fi
              ''} %k"
            '';

            # -- First-boot setup (LAN subnet detection, MAC fix, SSL certs) --
            systemd.services.spr-first-boot = {
              description = "SPR first-boot setup";
              wantedBy = [ "multi-user.target" ];
              before = [ "spr-base.service" ];
              unitConfig.ConditionPathExists = "!${cfg.dataDir}/.spr-setup-done";
              path = with pkgs; [ iproute2 openssl iw coreutils gnugrep gnused gawk bash ];
              serviceConfig = {
                Type = "oneshot";
                RemainAfterExit = true;
              };
              script = ''
                set -a
                . /etc/spr/config.sh

                cd ${cfg.dataDir}

                # Find non-conflicting LAN subnet
                if [ -x ${../../base/scripts/find_lan_subnet.sh} ]; then
                  ${../../base/scripts/find_lan_subnet.sh} || true
                fi

                # Fix interfaces without permanent MAC addresses
                if [ -x ${../../base/scripts/fix_mac_addresses.sh} ]; then
                  ${../../base/scripts/fix_mac_addresses.sh} || true
                fi

                # Generate self-signed SSL certificates for the API
                if [ ! -f ${cfg.dataDir}/configs/auth/www-api.key ]; then
                  mkdir -p ${cfg.dataDir}/configs/auth
                  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
                    -keyout ${cfg.dataDir}/configs/auth/www-api.key \
                    -out ${cfg.dataDir}/configs/auth/www-api.crt \
                    -days 3650 -nodes -subj "/CN=spr"
                fi

                # Unblock WiFi
                ${pkgs.util-linux}/bin/rfkill unblock wifi 2>/dev/null || true
                ${pkgs.iw}/bin/iw reg set US 2>/dev/null || true

                touch ${cfg.dataDir}/.spr-setup-done
              '';
            };

            # -- Root password: replaced by the admin password at setup --
            # as on the ubuntu and raspbian images (installer/scripts/run-scripts/run.sh):
            # the API's /setup leaves a bcrypt hash of the admin password in
            # configs/base/.setup_syshash, applied once .setup_done appears
            systemd.services.spr-setup-password = {
              description = "SPR root password from the admin password";
              wantedBy = [ "multi-user.target" ];
              unitConfig.ConditionPathExists = "!${cfg.dataDir}/configs/base/.setup_done";
              path = with pkgs; [ inotify-tools coreutils shadow ];
              script = ''
                base=${cfg.dataDir}/configs/base
                until [ -f "$base/.setup_done" ]; do
                  inotifywait -q -t 60 -e create,modify,move "$base" > /dev/null || sleep 1
                done
                if [ -f "$base/.setup_syshash" ]; then
                  hash=$(cat "$base/.setup_syshash")
                  # one bcrypt hash only: chpasswd reads one user per line
                  if [[ "$hash" =~ ^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$ ]]; then
                    echo "root:$hash" | chpasswd -e
                  else
                    echo "ignoring malformed .setup_syshash"
                  fi
                  rm -f "$base/.setup_syshash"
                fi
              '';
            };

            # -- config.sh: sourced by SPR shell scripts --
            # same variables as base/template_configs/base/config.sh, minus
            # DOCKERIF/DOCKERNET: no docker bridge here, and nft_rules.sh only
            # emits its docker0 rules when they are set
            environment.etc."spr/config.sh".text = lib.concatStringsSep "\n" ([
              "#!/bin/sh"
              "UPSTREAM_SERVICES_ENABLE=1"
              "WANIF=${cfg.wanInterface}"
              "RUN_WAN_DHCP=true"
              "RUN_WAN_DHCP_IPV=4"
              "WIREGUARD_PORT=${toString cfg.wireguardPort}"
              "LANIP=${cfg.lanIP}"
            ] ++ lib.optional (cfg.lanInterface != null) "LANIF=${cfg.lanInterface}" ++ [
              "if [ \"$LANIF\" = \"$WANIF\" ]; then"
              "\tunset LANIF"
              "fi"
            ]);

            # WAN DHCP is SPR's own client (spr-dhcp-client, the dhcp_client
            # container); dhcpcd would also grab the LAN and WiFi interfaces
            networking.useDHCP = lib.mkDefault false;
            networking.dhcpcd.enable = lib.mkDefault false;
            # the host's own resolver, as SPR's installers set it
            networking.nameservers = lib.mkDefault [ "1.1.1.1" ];

            # -- Create state/config directory tree --
            systemd.tmpfiles.rules =
              let d = cfg.dataDir; in
              map (p: "d ${p} 0755 root root -") [
                d
                "${d}/configs" "${d}/configs/base" "${d}/configs/dhcp"
                "${d}/configs/db" "${d}/configs/dns" "${d}/configs/devices"
                "${d}/configs/plugins" "${d}/configs/wifi" "${d}/configs/wireguard"
                "${d}/configs/pfw" "${d}/configs/scripts"
                "${d}/state" "${d}/state/api" "${d}/state/base"
                "${d}/state/dhcp" "${d}/state/dhcp-client" "${d}/state/dns"
                "${d}/state/wifi" "${d}/state/backups" "${d}/state/plugins"
                "${d}/state/plugins/db" "${d}/state/plugins/superd"
                "${d}/state/plugins/wireguard" "${d}/state/plugins/mesh"
                "${d}/state/plugins/packet_logs" "${d}/state/plugins/plugin-lookup"
                "${d}/state/plugins/plugin-lookup/data" "${d}/configs/plugins/plugin-lookup"
                "${d}/state/public" "${d}/ui"
                "${d}/configs/dyndns" "${d}/state/plugins/dyndns"
                "${d}/configs/ppp" "${d}/configs/wifi_uplink" "${d}/state/wifi_uplink"
                "${d}/configs/watchdog"
                "${d}/plugins" "${d}/plugins/plus" "${d}/plugins/user"
              ] ++ [
                "d ${d}/configs/auth 0700 root root -"
                # plugin images, containers and networks (superd/nixos)
                "d /var/lib/spr-plugins 0700 root root -"
                "f ${d}/state/dns/local_mappings 0644 root root -"
                "f ${d}/state/dhcp/leases.txt 0644 root root -"
                "f ${d}/state/dhcp-client/resolv.conf 0644 root root -"
                # /bin/bash for scripts using #!/bin/bash (wg-json etc)
                "L+ /bin/bash - - - - ${pkgs.bash}/bin/bash"
              ];

            # ============================================================
            #  systemd services
            # ============================================================

            # first boot: the template configs, and config.sh and lanip for
            # every service (run outside spr-base's private filesystem)
            systemd.services.spr-init-configs = {
              description = "SPR configuration setup";
              requiredBy = [ "spr-base.service" ];
              before = [ "spr-base.service" ];
              serviceConfig = {
                Type = "oneshot";
                RemainAfterExit = true;
                ExecStart = pkgs.writeShellScript "spr-base-init-configs" ''
                  # Copy template configs on first boot (don't overwrite existing)
                  if [ ! -f ${d}/configs/dns/Corefile ]; then
                    echo "First boot: copying template configs..."
                    ${pkgs.rsync}/bin/rsync -a --ignore-existing \
                      ${../../base/template_configs}/ ${d}/configs/
                  fi
                  # Ensure config.sh exists for all services
                  # Copy (not symlink) — services run in mount namespaces
                  # where /etc/spr/ isn't bind-mounted, so symlinks dangle.
                  cp /etc/spr/config.sh ${d}/configs/base/config.sh
                  chmod 0644 ${d}/configs/base/config.sh
                  echo "${cfg.lanIP}" > ${d}/configs/base/lanip
                '';
              };
            };

            # spr-base: privileged, host network (manages network + nftables)
            systemd.services.spr-base = {
              description = "SPR base network and firewall setup";
              wantedBy = [ "multi-user.target" ];
              before = [ "spr-dhcp.service" "spr-dns.service" "spr-api.service" ];
              path = with pkgs; [
                # nft_rules.sh expects `iptables` to be the nft backend (as in
                # the base container); the SPR kernel has no legacy ip_tables
                (runCommand "iptables-nft-default" {} ''
                  mkdir -p $out/bin
                  ln -s ${iptables}/bin/iptables-nft $out/bin/iptables
                '')
                nftables iptables iproute2 conntrack-tools
                coreutils bash util-linux procps gnugrep gawk gnused
              ];
              # base volumes: configs/base/, state/base/, state/plugins/, plugins/
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                PrivateDevices = false;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  "${baseScriptsDir}:/scripts"
                  (bpRo "plugins")
                ];
                BindPaths = [ (bp "configs/base") (bp "state/base") (bp "state/plugins") ];
                # base/scripts/startup.sh, as the base container runs it: the
                # LAN address, firewall (mesh_rules.sh from the mesh plugin on
                # a mesh leaf), accounting and tuning, then it holds
                # state/base/ready, which the API polls
                ExecStart = "/scripts/startup.sh";
                # up once the rules are loaded and the lock is held
                ExecStartPost = pkgs.writeShellScript "spr-base-ready" ''
                  while kill -0 $MAINPID 2>/dev/null; do
                    flock -n /state/base/ready true || exit 0
                    sleep 0.2
                  done
                  exit 1
                '';
                ExecStop = pkgs.writeShellScript "spr-base-stop" ''
                  ${pkgs.nftables}/bin/nft flush ruleset
                  ${pkgs.iproute2}/bin/ip link del sprloop 2>/dev/null || true
                  rm -f ${cfg.dataDir}/state/base/ready
                '';
              };
            };

            # dhcp volumes: configs/base/:ro, configs/dhcp/, state/dhcp/, state/plugins/mesh/:ro
            systemd.services.spr-dhcp = {
              description = "SPR DHCP server (CoreDHCP)";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" ];
              requires = [ "spr-base.service" ];

              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindPaths = [ (bp "configs/dhcp") (bp "state/dhcp") ];
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base") (bpRo "state/plugins/mesh")
                  "${../../dhcp/scripts}:/scripts"
                  "${sprPkgs.spr-dhcp}/bin/coredhcpd:/coredhcpd"
                ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            # dns volumes: configs/dns/, state/api/, state/dns/, state/public/:ro, state/plugins/mesh/:ro
            systemd.services.spr-dns = {
              description = "SPR DNS server (CoreDNS)";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" ];
              requires = [ "spr-base.service" ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindPaths = [ (bp "configs/dns") (bp "state/api") (bp "state/dns") ];
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "state/public") (bpRo "state/plugins/mesh")
                  "${../../dns/scripts}:/scripts"
                  "${sprPkgs.spr-dns}/bin/coredns:/coredns"
                ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            # api volumes: configs/{auth,base,devices,dns,plugins,ppp,wifi,wifi_uplink,wireguard,scripts,pfw}/
            #   state/{wifi,dhcp,dns,api,backups,base,plugins,public}/, /ui/
            systemd.services.spr-api = {
              description = "SPR REST API";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" "spr-dns.service" "spr-dhcp.service" ];
              requires = [ "spr-base.service" ];
              # everything the API execs (api/Dockerfile installs the same)
              path = with pkgs; [
                iproute2 nftables iw systemd conntrack-tools nettools procps
                gnutar macchanger sprPkgs.spr-git openssh coreutils
                sprPkgs.spr-hostapd sprPkgs.spr-xdp-loader
              ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "always";
                RestartSec = 5;
                BindPaths = [
                  (bp "configs/auth") (bp "configs/base") (bp "configs/devices")
                  (bp "configs/dns") (bp "configs/plugins") (bp "configs/wifi")
                  (bp "configs/wireguard") (bp "configs/scripts") (bp "configs/pfw")
                  (bp "state/wifi") (bp "state/dhcp") (bp "state/dns")
                  (bp "state/api") (bp "state/backups") (bp "state/base")
                  (bp "state/plugins") (bp "state/public")
                  (bp "configs/ppp") (bp "configs/wifi_uplink") (bp "state/dhcp-client")
                  # Bind the prebuilt frontend store path directly as /ui so
                  # the API serves the SPA from /
                  "${sprPkgs.spr-frontend}:/ui"
                ];
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  "${../../api/scripts}:/scripts"
                  "${sprPkgs.spr-api}/bin/api:/api"
                  # the DHCP filter the API attaches to KVM plugin bridges
                  "${sprPkgs.spr-wifid-ebpf}/lib/filter_dhcp_mismatch.o:/code/filter_dhcp_mismatch.o"
                  # log viewer (journalctl) and crash reports
                  "-/var/log/journal" "/etc/machine-id"
                  "-/var/lib/systemd/coredump:/coredump"
                ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            systemd.services.spr-wifid = lib.mkIf cfg.enableWifi {
              description = "SPR WiFi daemon (hostapd)";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-api.service" "spr-dhcp.service" ];
              requires = [ "spr-api.service" "spr-dhcp.service" ];

              path = with pkgs; [
                sprPkgs.spr-hostapd
                sprPkgs.spr-xdp-loader
                iw iproute2 lshw curl coreutils bash gnused gnugrep gawk procps nftables
                # rfkill: startup.sh and setup.sh unblock WiFi on a Pi
                util-linux
              ];
              # wifid volumes: configs/base/:ro, configs/wifi/, state/wifi/
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 10;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base")
                  # eBPF and xdp-loader at /code/ where Go binary expects them
                  "${sprPkgs.spr-wifid-ebpf}/lib/filter_dhcp_mismatch.o:/code/filter_dhcp_mismatch.o"
                  "${sprPkgs.spr-xdp-loader}/bin/xdp-loader:/code/xdp-tools/xdp-loader/xdp-loader"
                  "${wifidScriptsDir}:/scripts"
                  # startup.sh runs the hostapd control plane as /hostap_dhcp_helper
                  "${sprPkgs.spr-wifid-helper}/bin/hostap_dhcp_helper:/hostap_dhcp_helper"
                  # startup-rust.sh (configs/wifi/enable_rust) runs the oxwifid AP
                  "${sprPkgs.spr-oxwifid}/bin/barely-ap:/usr/local/bin/barely-ap"
                ];
                BindPaths = [
                  (bp "configs/wifi")
                  (bp "state/wifi")
                  # /sys and /dev needed for hostapd hardware access
                  "/sys"
                  "/dev"
                ];
                # PrivateDevices' device policy denies /dev/rfkill even with
                # /dev bound in; the scripts' rfkill unblock needs it
                DeviceAllow = [ "/dev/rfkill rw" ];
                # hostapd -B and hostapd_cli stay in the unit's cgroup, so a
                # stop ends them without a pkill (which would match any
                # process with "hostapd" in its command line)
                ExecStart = pkgs.writeShellScript "spr-wifid-start" ''
                  exec /scripts/startup.sh
                '';
              };
            };

            # wireguard volumes: configs/base/:ro, configs/wireguard/, state/plugins/wireguard/,
            #   state/dhcp/, state/plugins/mesh/:ro
            # Also needs /scripts/ for wg-json, up.sh, down.sh
            systemd.services.spr-wireguard = lib.mkIf cfg.enableWireguard {
              description = "SPR WireGuard VPN";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" "spr-dhcp.service" "spr-api.service" ];
              requires = [ "spr-base.service" ];
              path = with pkgs; [ wireguard-tools iproute2 gnused gnugrep bash coreutils ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base")
                  (bpRo "state/plugins/mesh")
                  "${../../wireguard/scripts}:/scripts"
                  "${sprPkgs.spr-wireguard}/bin/wireguard_plugin:/wireguard_plugin"
                ];
                BindPaths = [
                  (bp "configs/wireguard")
                  (bp "state/plugins/wireguard")
                  (bp "state/dhcp")
                ];
                ExecStart = "/scripts/startup.sh";
                # no shell here: "-" ignores the failure if wg0 is already gone
                ExecStopPost = "-${pkgs.iproute2}/bin/ip link del wg0";
              };
            };

            # db volumes: configs/base/:ro, configs/db/, state/api/, state/plugins/db/
            systemd.services.spr-db = lib.mkIf cfg.enableDB {
              description = "SPR database (BoltDB)";
              wantedBy = [ "multi-user.target" ];
              # holds a long-lived sprbus connection; the API recreates the bus
              # socket when it restarts, so restart with it
              partOf = [ "spr-api.service" ];
              after = [ "spr-api.service" ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base")
                  "${../../db/scripts}:/scripts"
                  "${sprPkgs.spr-db}/bin/boltapi:/boltapi"
                ];
                BindPaths = [ (bp "configs/db") (bp "state/api") (bp "state/plugins/db") ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            systemd.services.spr-packet-logs = lib.mkIf cfg.enablePacketLogs {
              description = "SPR packet logging";
              wantedBy = [ "multi-user.target" ];
              # holds a long-lived sprbus connection; the API recreates the bus
              # socket when it restarts, so restart with it
              partOf = [ "spr-api.service" ];
              # needs the sprbus socket the API creates
              after = [ "spr-base.service" "spr-api.service" ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "always";
                RestartSec = 5;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base")
                  "${../../packet_logs/scripts}:/scripts"
                  "${sprPkgs.spr-packet-logs}/bin/packet_logs:/packet_logs"
                ];
                BindPaths = [ (bp "state/api") (bp "state/plugins/packet_logs") ];
                # spr-api is Type=simple: wait for its sprbus socket
                ExecStartPre = pkgs.writeShellScript "spr-packet-logs-wait" ''
                  for i in $(seq 60); do [ -S /state/api/eventbus.sock ] && break; sleep 1; done
                '';
                ExecStart = "/scripts/startup.sh";
              };
            };

            systemd.services.spr-multicast-proxy = lib.mkIf cfg.enableMulticastProxy {
              description = "SPR multicast UDP proxy";
              wantedBy = [ "multi-user.target" ];
              # holds a long-lived sprbus connection; the API recreates the bus
              # socket when it restarts, so restart with it
              partOf = [ "spr-api.service" ];
              after = [ "spr-base.service" "spr-api.service" ];
              requires = [ "spr-base.service" ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base") (bpRo "state/public") (bpRo "state/plugins/mesh")
                  "${../../multicast_udp_proxy/scripts}:/scripts"
                  "${sprPkgs.spr-multicast-proxy}/bin/multicastproxy:/code/multicastproxy"
                ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            # plugin-lookup volumes: state/plugins/plugin-lookup/
            # plugin-lookup volumes: configs/plugins/plugin-lookup, state/api,
            # state/public:ro, state/plugins/plugin-lookup; data in /data
            systemd.services.spr-plugin-lookup = lib.mkIf cfg.enablePluginLookup {
              description = "SPR IP/ASN lookup plugin";
              wantedBy = [ "multi-user.target" ];
              # holds a long-lived sprbus connection; the API recreates the bus
              # socket when it restarts, so restart with it
              partOf = [ "spr-api.service" ];
              # downloads need the network and a sane clock for TLS
              wants = [ "network-online.target" ];
              after = [ "spr-base.service" "spr-dns.service" "spr-api.service"
                        "network-online.target" "time-sync.target" ];
              requires = [ "spr-base.service" ];
              path = with pkgs; [ curl gzip gnugrep gawk coreutils ];
              environment.SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 60;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "state/public")
                  "${pluginLookupScriptsDir}:/scripts"
                  "${sprPkgs.spr-plugin-lookup}/bin/lookup_plugin:/lookup_plugin"
                ];
                BindPaths = [
                  (bp "configs/plugins/plugin-lookup") (bp "state/api")
                  (bp "state/plugins/plugin-lookup")
                  "${d}/state/plugins/plugin-lookup/data:/data"
                ];
                # the image's /data files, then plugin-lookup/scripts/startup.sh
                ExecStartPre = pkgs.writeShellScript "spr-plugin-lookup-data" ''
                  cp -f ${../../plugin-lookup/data}/* /data/
                '';
                ExecStart = "/scripts/startup.sh";
              };
            };

            # superd volumes: configs/base/, state/api/, state/plugins/superd/
            # ------------------------------------------------------------
            #  Plugins from this repo. Like the template api.json, these
            #  are off until enabled in the UI, which has superd start them
            #  (see composeMap in superd/nixos).
            # ------------------------------------------------------------

            # dyndns/docker-compose.yml: state/plugins/dyndns, configs/dyndns
            systemd.services.spr-dyndns = {
              description = "SPR dynamic DNS plugin";
              after = [ "spr-base.service" "spr-api.service" ];
              serviceConfig = sprServiceConfig // {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindReadOnlyPaths = sprServiceConfig.BindReadOnlyPaths
                  ++ [ "${sprPkgs.spr-godns}/bin/godns:/godns" ];
                BindPaths = [ (bp "state/plugins/dyndns") (bp "configs/dyndns") ];
                ExecStart = "${sprPkgs.spr-dyndns}/bin/dyndns_plugin";
              };
            };

            # ppp/docker-compose.yml: host network, privileged, configs/ppp as /etc/ppp
            systemd.services.spr-ppp = {
              description = "SPR PPP uplink";
              after = [ "spr-base.service" ];
              path = with pkgs; [ jq iproute2 bash coreutils ];
              serviceConfig = {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindPaths = [ "${d}/configs/ppp:/etc/ppp" ];
                BindReadOnlyPaths = [ "${sprPkgs.spr-ppp}/lib/pppd:/usr/lib/pppd" ];
                ExecStart = pkgs.runCommand "spr-ppp-startup" {} ''
                  substitute ${../../ppp/scripts/startup.sh} $out \
                    --replace-fail /usr/sbin/pppd ${sprPkgs.spr-ppp}/bin/pppd
                  chmod +x $out
                '';
              };
            };

            # wifi_uplink/docker-compose.yml: host network, privileged
            systemd.services.spr-wifi-uplink = {
              description = "SPR WiFi uplink";
              after = [ "spr-base.service" ];
              path = with pkgs; [ sprPkgs.spr-wpa-supplicant jq iproute2 bash coreutils procps ];
              serviceConfig = {
                Type = "simple";
                Restart = "on-failure";
                RestartSec = 5;
                BindPaths = [ (bp "configs/wifi_uplink") (bp "state/wifi_uplink") ];
                BindReadOnlyPaths = [
                  "${../../wifi_uplink/scripts}:/scripts"
                  "${sprPkgs.spr-oxwifid}/bin/barely-cli:/usr/local/sbin/barely-cli"
                ];
                ExecStart = "/scripts/startup.sh";
              };
            };

            # watchdog container: systemd pets /dev/watchdog itself
            systemd.settings.Manager = lib.mkIf cfg.enableWatchdog {
              RuntimeWatchdogSec = "15s";
            };

            # dhcp_client container: dhcp/scripts/client.sh runs coredhcp_client
            # on enabled uplinks and records gateways for the API
            systemd.services.spr-dhcp-client = {
              description = "SPR WAN DHCP client";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" ];
              wants = [ "network-pre.target" ];
              before = [ "network-online.target" ];
              path = with pkgs; [ iproute2 jq ethtool psmisc inotify-tools coreutils gawk gnugrep bash ];
              serviceConfig = {
                Type = "simple";
                Restart = "always";
                RestartSec = 5;
                TemporaryFileSystem = "/:ro";
                MountAPIVFS = true;
                # its own writable resolv.conf below, not the shared read-only one
                BindReadOnlyPaths = lib.remove "-/etc/resolv.conf" sprServiceConfig.BindReadOnlyPaths ++ [
                  (bpRo "configs/base") (bpRo "state/wifi_uplink")
                  "${../../dhcp/scripts}:/scripts"
                  "${sprPkgs.spr-dhcp}/bin/coredhcp_client:/coredhcp_client"
                ];
                BindPaths = [
                  (bp "state/dhcp-client")
                  # coredhcp_client writes resolv.conf before it adds the default
                  # route, and gives up if it can't; in docker that is the
                  # container's own file, so give it a private one
                  "${d}/state/dhcp-client/resolv.conf:/etc/resolv.conf"
                ];
                ExecStart = "/scripts/client.sh";
              };
            };

            # wifid-setup/docker-compose.yml: the wifid image running setup.sh,
            # which brings up a setup AP on the Pi's onboard WiFi in setup mode.
            # Started by the API through superd.
            systemd.services.spr-wifid-setup = lib.mkIf cfg.enableWifi {
              description = "SPR WiFi setup AP";
              after = [ "spr-api.service" ];
              inherit (config.systemd.services.spr-wifid) path;
              serviceConfig = config.systemd.services.spr-wifid.serviceConfig // {
                Restart = "on-failure";
                ExecStart = "/scripts/setup.sh";
              };
            };

            # superd runs plugins as units of their own (superd/nixos/plugins.go):
            # it clones them into the data directory, unpacks their images,
            # mounts overlays and sets up their networks, so like the docker
            # superd it has the whole host
            systemd.services.spr-superd = {
              description = "SPR supervisor daemon (systemd-native)";
              wantedBy = [ "multi-user.target" ];
              after = [ "spr-base.service" ];
              environment = {
                SUPERDIR = toString cfg.dataDir;
                SPR_CRUN = "${sprPkgs.spr-krun-runtime}/bin/crun";
                SPR_KRUN = "${sprPkgs.spr-krun-runtime}/bin/krun";
                SPR_INIT = "${pkgs.pkgsStatic.tini}/bin/tini";
                SPR_VERSION = "v${lib.removeSuffix "-dev" sprImagesTag}";
                SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
                # the Sigstore trust root for attestation checks is cached
                # in $HOME/.sigstore
                HOME = "/var/lib/spr-superd";
              };
              # nix: system updates (superd/nixos/sysupdate.go)
              path = with pkgs; [ systemd iproute2 sprPkgs.spr-git util-linux config.nix.package ];
              serviceConfig = {
                Type = "simple";
                Restart = "always";
                RestartSec = 5;
                ExecStart = "${sprPkgs.spr-superd}/bin/superd";
                StateDirectory = "spr-superd";
              };
            };
            # /run/spr-krun and the policy directories (krun_policy.go)
            systemd.tmpfiles.packages = [ sprPkgs.spr-krun-runtime ];
          };
        };

      # ==============================================================
      #  NixOS configurations (VM-bootable)
      # ==============================================================

      # Build VM:  nix build .#nixosConfigurations.spr-vm.config.system.build.vm
      # Run:       ./result/bin/run-spr-vm-vm
      nixosConfigurations.spr-vm = nixpkgs.lib.nixosSystem {
        system = "aarch64-linux";
        modules = [
          self.nixosModules.default
          ({ config, pkgs, lib, modulesPath, ... }: {
            imports = [ (modulesPath + "/profiles/qemu-guest.nix") ];

            services.spr = {
              enable = true;
              wanInterface = "eth0";
              lanIP = "192.168.2.1";
              enableWireguard = true;
              enableWifi = false;  # no WiFi hardware in VM
              enableDB = true;
              enablePacketLogs = false;
              enablePluginLookup = false;
              enableMulticastProxy = false;
            };

            # VM configuration
            virtualisation.vmVariant = {
              virtualisation = {
                memorySize = 2048;
                cores = 2;
                diskSize = 4096; # 4 GiB
                graphics = false;
                # Forward host ports to VM for access
                forwardPorts = [
                  { from = "host"; host.port = 8080; guest.port = 80; }   # SPR API
                  { from = "host"; host.port = 8443; guest.port = 443; }  # SPR API (TLS)
                  { from = "host"; host.port = 2222; guest.port = 22; }   # SSH
                ];
              };
            };

            # Enable SSH for access
            services.openssh = {
              enable = true;
              settings.PermitRootLogin = "yes";
            };
            users.users.root.password = "spr";

            # Serial console for headless VM
            boot.kernelParams = [ "console=ttyAMA0,115200" ];

            system.stateVersion = "24.11";
            networking.hostName = "spr-vm";
          })
        ];
      };

      # ==============================================================
      #  SPR aarch64 image (Pi 5 / CM5)
      #  Bootable on SD card, USB drive, eMMC, or NVMe via Pi 5 firmware
      #  Build: nix build .#images.spr-aarch64
      # ==============================================================
      # Pi 5 / CM5 boot: use community nvmd/nixos-raspberrypi for the boot
      # infrastructure (firmware, DTBs, config.txt, bootloader), then override
      # boot.kernelPackages to use OUR SPR prebuilt kernel.
      nixosConfigurations.spr-aarch64 = nixos-raspberrypi.lib.nixosSystem {
        specialArgs = { inherit nixos-raspberrypi; };
        modules = [
          self.nixosModules.default
          nixos-raspberrypi.nixosModules.sd-image
          ./pi5-boot-img.nix
          ({ config, pkgs, lib, modulesPath, ... }: {
            imports = [
              # no perl at runtime: userborn, /etc overlay, systemd initrd
              (modulesPath + "/profiles/perlless.nix")
            ] ++ (with nixos-raspberrypi.nixosModules; [
              raspberry-pi-5.base
              raspberry-pi-5.display-vc4
            ]);

            # -- image size --
            # only the firmware for supported hardware (see spr-firmware)
            hardware.enableRedistributableFirmware = lib.mkForce false;
            hardware.firmware = [
              (sprFor pkgs).packages.spr-firmware
              pkgs.wireless-regdb
            ];
            # boot partition: config.txt and a single (signable) boot.img
            # with kernel, initrd and device trees; no loose Pi firmware,
            # the Pi 5's bootloader and firmware are in its SPI flash
            spr.bootImg.enable = true;
            # no raspberrypi-eeprom: the bootloader ships in the SPI flash, and
            # its updater carries every bootloader release plus python
            environment.systemPackages = [
              pkgs.tcpdump pkgs.pciutils pkgs.usbutils
            ];
            # sd-image pulls in profiles/base.nix, a rescue toolkit (w3m, which
            # needs perl, testdisk, cryptsetup, sshfs, ...) a router doesn't need
            disabledModules = [ (modulesPath + "/profiles/base.nix") ];
            # no copy of nixpkgs on the device, no on-device rebuilds
            nixpkgs.flake.setNixPath = false;
            nixpkgs.flake.setFlakeRegistry = false;
            nix.channel.enable = false;
            system.tools.nixos-rebuild.enable = false;
            system.tools.nixos-option.enable = false;
            # nix stays on the device for in-place updates (update.sh), which
            # keeps only the current and previous system in the profile
            documentation.enable = false;
            documentation.man.enable = lib.mkForce false;
            programs.nano.enable = false;
            # systemd-importd (machine image downloads) pulls in gnupg
            systemd.suppressedSystemUnits = [ "systemd-importd.service" ];
            # no bluetooth: raspberry-pi-5.bluetooth (bluez) isn't imported
            security.sudo.enable = false;
            xdg.mime.enable = false;

            # Force boot.kernelPackages to our SPR prebuilt kernel.
            # The community flake's bootloader reads
            # config.boot.kernelPackages.kernel to find the kernel binary
            # to install on the FAT partition. We don't need a full package
            # set, just enough surface for that lookup.
            boot.kernelPackages = lib.mkForce (let
              sprKernel = (sprFor pkgs).packages.spr-kernel-prebuilt // {
                override = _: sprKernel;
              };
              kpkgs = {
                kernel = sprKernel;
                kernelPackages = {};
                extend = _: kpkgs;
                callPackage = _: _: null;
                kernelAtLeast = v: pkgs.lib.versionAtLeast sprKernel.version v;
                kernelOlder = v: pkgs.lib.versionOlder sprKernel.version v;
                stdenv = pkgs.stdenv;
              };
            in kpkgs);
            # Disable ZFS — we don't have kernel source to build the modules
            boot.supportedFilesystems = lib.mkForce [
              "ext4" "vfat" "squashfs" "overlay" "tmpfs"
            ];

            # Explicitly install SPR kernel modules to /lib/modules/<ver>/.
            # NixOS normally does this via system.modulesTree from
            # boot.kernelPackages.kernel, but our minimal kpkgs shim doesn't
            # exercise that path. Force it manually.
            system.modulesTree = lib.mkForce
              [ (sprFor pkgs).packages.spr-kernel-prebuilt ];

            # NixOS keeps modules in the store and exposes them via
            # /run/booted-system/kernel-modules. Out-of-tree tools (modprobe
            # called via subprocess from SPR, third-party scripts) expect
            # /lib/modules/<ver>. Symlink it at activation time.
            systemd.tmpfiles.rules = [
              "L+ /lib/modules - - - - /run/booted-system/kernel-modules/lib/modules"
            ];

            # Enable booting in QEMU virt machine for testing. Pi defaults
            # cover mmc/sdhci; virtio is harmless on real hardware.
            boot.initrd.kernelModules = [ "virtio_blk" "virtio_pci" ];

            # SPR-specific config.txt additions for Pi 5 / CM5:
            #   - PCIe x1 enabled (NVMe / WiFi M.2 / HATs)
            #   - 32-bit DMA quirk + Pi 5 compat overlay (mt76 etc.)
            #   - UART0 on GPIO14/15 for serial console
            # Use base-dt-params (renders `dtparam=KEY=VALUE`), NOT options
            # (which renders bare `KEY=VALUE` and is invalid for these keys).
            hardware.raspberry-pi.config.all = {
              base-dt-params = {
                pciex1 = { enable = true; };                  # dtparam=pciex1
                pciex4_reset = { enable = true; value = 0; }; # dtparam=pciex4_reset=0
                uart0 = { enable = true; value = "on"; };
                uart0_console = { enable = true; value = true; };
              };
              dt-overlays = {
                pcie-32bit-dma = { enable = true; };
                pciex1-compat-pi5 = {
                  enable = true;
                  params.no-mip = { enable = true; };
                };
              };
            };

            services.spr = {
              enable = true;
              wanInterface = "eth0";
              lanInterface = "eth1";
              lanIP = "192.168.2.1";
              wireguardPort = 51280;
              enableWireguard = true;
              enableWifi = true;
              enableDB = true;
              enablePacketLogs = true;
              enablePluginLookup = true;
              enableMulticastProxy = true;
            };

            services.openssh.enable = true;
            # the installer profile used to allow this; keep root password login
            services.openssh.settings.PermitRootLogin = "yes";
            # userborn takes only one of the password options; "spr", like the
            # other SPR images, until setup replaces it (spr-setup-password). The initial one is
            # set only when root is created, so a changed password survives
            # updates (hashedPassword would reset it on every activation).
            users.users.root = {
              initialHashedPassword = lib.mkForce "$6$sprnixos$PQ5JL2bvnDErqzQzUsriOUoPswmLtcD3WSJqGhJirtn/RPcqnTgmfWklCoXt9EvYXXeTpGnQnpbIiiXiXN04l1";
              hashedPassword = lib.mkForce null;
              password = lib.mkForce null;
              initialPassword = lib.mkForce null;
            };

            networking.hostName = "spr";
            system.stateVersion = "24.11";
          })
        ];
      };

      # The same system cross-compiled on an x86_64 host, as CI builds it
      # (build-image.sh): native speed instead of qemu emulation
      nixosConfigurations.spr-aarch64-cross = self.nixosConfigurations.spr-aarch64.extendModules {
        modules = [ { nixpkgs.buildPlatform = "x86_64-linux"; } ];
      };

      # ==============================================================
      #  SPR x86_64 ISO
      #  Build: nix build .#images.spr-x86_64
      # ==============================================================
      nixosConfigurations.spr-iso = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          "${nixpkgs}/nixos/modules/installer/cd-dvd/iso-image.nix"
          "${nixpkgs}/nixos/modules/profiles/all-hardware.nix"
          self.nixosModules.default
          ({ config, pkgs, ... }: {
            services.spr = {
              enable = true;
              wanInterface = "eth0";
              lanIP = "192.168.2.1";
              wireguardPort = 51280;
              enableWireguard = true;
              enableWifi = false;
              enableDB = true;
            };

            services.openssh.enable = true;
            users.users.root.password = "spr";

            isoImage.isoName = "spr-nixos.iso";
            isoImage.makeEfiBootable = true;
            isoImage.makeUsbBootable = true;

            system.stateVersion = "24.11";
            networking.hostName = "spr";
          })
        ];
      };

      images.spr-x86_64 = self.nixosConfigurations.spr-iso.config.system.build.isoImage;

      # Bare-metal config (for reference / customization)
      nixosConfigurations.spr-router = nixpkgs.lib.nixosSystem {
        system = "aarch64-linux";
        modules = [
          self.nixosModules.default
          ({ ... }: {
            services.spr = {
              enable = true;
              wanInterface = "eth0";
              lanInterface = "eth1";
              lanIP = "192.168.2.1";
              wireguardPort = 51280;
              enableWireguard = true;
              enableWifi = true;
              enableDB = true;
            };

            boot.loader.systemd-boot.enable = true;
            fileSystems."/" = { device = "/dev/sda1"; fsType = "ext4"; };
            system.stateVersion = "24.11";
            networking.hostName = "spr-router";
          })
        ];
      };
    };
}
