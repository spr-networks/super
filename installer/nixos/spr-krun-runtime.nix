# The SPR libkrun runtime (host-packages/spr-krun-runtime) built with Nix:
# libkrunfw with SPR's guest kernel, libkrun and crun with SPR's patch, from
# the same pinned sources as the Debian package (versions.env). crun run as
# `krun` is the libkrun handler, the runtime KVM plugins run under.
{ pkgs, lib, cargoHash }:

let
  dir = ../../host-packages/spr-krun-runtime;
  v = builtins.listToAttrs (map (m: { name = builtins.elemAt m 0; value = builtins.elemAt m 1; })
    (builtins.filter (m: m != null)
      (map (builtins.match "([A-Z0-9_]+)=(.*)")
        (lib.splitString "\n" (builtins.readFile (dir + "/versions.env"))))));

  # one combined patch covers libkrun and crun: split it per source tree
  subPatch = tree: pkgs.runCommand "spr-krun-${tree}.patch" {
    nativeBuildInputs = [ pkgs.patchutils ];
  } ''
    filterdiff -p1 -i '${tree}/*' ${dir + "/patches/0001-spr-krun-runtime.patch"} > $out
  '';

  sprKernelConfig = pkgs.fetchurl {
    url = "https://raw.githubusercontent.com/spr-networks/spr-debian-kernel/${v.SPR_KERNEL_CONFIG_COMMIT}/spr.config";
    sha256 = v.SPR_KERNEL_CONFIG_SHA256;
  };

  libkrunfw = pkgs.libkrunfw.overrideAttrs (old: {
    version = v.LIBKRUNFW_VERSION;
    src = pkgs.fetchurl {
      url = "https://github.com/libkrun/libkrunfw/archive/${v.LIBKRUNFW_COMMIT}.tar.gz";
      sha256 = v.LIBKRUNFW_SOURCE_SHA256;
    };
    kernelSrc = pkgs.fetchurl {
      url = "https://cdn.kernel.org/pub/linux/kernel/v6.x/${v.LIBKRUNFW_KERNEL_VERSION}.tar.xz";
      sha256 = v.LIBKRUNFW_KERNEL_SHA256;
    };
    # as build.sh: SPR's patches rebased onto the newer guest kernel, the
    # rest archived, and the SPR kernel's networking options built in
    postPatch = ''
      cp ${dir}/patches/libkrunfw/*.patch patches/
      mkdir -p patches/archived
      mv patches/000[3-9]-*.patch patches/001[0-9]-*.patch \
         patches/002[235-9]-*.patch patches/003[0-6]-*.patch patches/archived/
      test "$(find patches -maxdepth 1 -name '0*.patch' | wc -l)" -eq 5
      sed -i \
        -e "s/^KERNEL_VERSION = .*/KERNEL_VERSION = ${v.LIBKRUNFW_KERNEL_VERSION}/" \
        -e 's/find patches\/ -name/find patches\/ -maxdepth 1 -name/' \
        -e 's|curl $(KERNEL_REMOTE) -o $(KERNEL_TARBALL)|ln -s $(kernelSrc) $(KERNEL_TARBALL)|' \
        Makefile
      # later assignments win in olddefconfig, as with merge_config.sh
      awk '
        /^# .*BPF/ { network = 1 }
        /^# .*Firmware loader/ { network = 0 }
        network && /^CONFIG_/ { sub(/=m$/, "=y"); print }
        /^# .*Misc/ { misc = 1; next }
        /^# .*Disable unused/ { misc = 0 }
        misc && /^CONFIG_(DUMMY|NET_UDP_TUNNEL|WIREGUARD)=/ { sub(/=m$/, "=y"); print }
      ' ${sprKernelConfig} >> config-libkrunfw_aarch64
      cat ${dir}/kernel-net.config >> config-libkrunfw_aarch64
    '';
    postBuild = ''
      for option in IP_ADVANCED_ROUTER IP_MULTIPLE_TABLES IPV6_MULTIPLE_TABLES \
          BRIDGE_NETFILTER IP_SET NET_SCHED NFT_COMPAT NFT_MASQ NFT_NAT \
          NETFILTER_XTABLES NETFILTER_XT_TARGET_MARK NETFILTER_XT_TARGET_MASQUERADE \
          NETFILTER_XT_TARGET_TPROXY NETFILTER_XT_MATCH_SOCKET IP_NF_IPTABLES \
          IP6_NF_IPTABLES WIREGUARD; do
        grep -qx "CONFIG_$option=y" ${v.LIBKRUNFW_KERNEL_VERSION}/.config
      done
    '';
  });

  libkrun = (pkgs.libkrun.override { inherit libkrunfw; withNet = true; }).overrideAttrs (old: {
    version = v.LIBKRUN_VERSION;
    src = pkgs.fetchurl {
      url = "https://github.com/libkrun/libkrun/archive/${v.LIBKRUN_COMMIT}.tar.gz";
      sha256 = v.LIBKRUN_SHA256;
    };
    cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
      inherit (old) pname;
      version = v.LIBKRUN_VERSION;
      src = pkgs.fetchurl {
        url = "https://github.com/libkrun/libkrun/archive/${v.LIBKRUN_COMMIT}.tar.gz";
        sha256 = v.LIBKRUN_SHA256;
      };
      hash = cargoHash;
    };
    patches = [ (subPatch "libkrun") ];
    patchFlags = [ "-p2" ];
    postInstall = old.postInstall + ''
      for sym in krun_add_net_tap krun_add_vsock_port2 krun_set_rlimits; do
        ${pkgs.binutils}/bin/nm -D --defined-only $out/lib64/libkrun.so.${v.LIBKRUN_VERSION} | grep -q " $sym$"
      done
    '';
  });

  crun = (pkgs.crun.override { inherit libkrun; withLibkrun = true; }).overrideAttrs (old: {
    version = v.CRUN_VERSION;
    src = pkgs.fetchurl {
      url = "https://github.com/containers/crun/releases/download/${v.CRUN_VERSION}/crun-${v.CRUN_VERSION}.tar.gz";
      sha256 = v.CRUN_SHA256;
    };
    patches = [ (subPatch "crun") ];
    patchFlags = [ "-p2" ];
    # no checkpoint/restore, as the Debian package: criu would bring python3
    buildInputs = lib.remove pkgs.criu old.buildInputs ++ [ pkgs.json_c ];
    env = (old.env or { }) // { NIX_LDFLAGS = ""; };
    # the release tarball carries its version files; the tests need privileges
    postPatch = ''
      substituteInPlace src/libcrun/handlers/krun.c \
        --replace-fail '"libkrun.so.1"' '"${libkrun}/lib/libkrun.so.1"'
    '';
    doCheck = false;
  });
in
pkgs.runCommand "spr-krun-runtime-${v.SPR_KRUN_PACKAGE_VERSION}" {
  passthru = { inherit libkrun libkrunfw crun; inherit (v) SPR_KRUN_PACKAGE_VERSION; };
} ''
  mkdir -p $out/bin $out/lib/tmpfiles.d
  # crun picks its libkrun handler when invoked as krun
  ln -s ${crun}/bin/crun $out/bin/krun
  ln -s ${crun}/bin/crun $out/bin/crun
  cp ${dir}/debian/spr-krun-runtime.tmpfiles $out/lib/tmpfiles.d/spr-krun-runtime.conf
  for s in run.oci.spr.krun.policy /var/lib/spr-krun/policies /run/spr-krun/listen krun_set_rlimits; do
    grep -q "$s" ${crun}/bin/crun
  done
''
