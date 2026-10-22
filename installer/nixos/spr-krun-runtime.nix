# The SPR libkrun runtime: the published spr-krun-runtime .deb of the SPR
# release (fetch-images.sh, attestation-verified), not rebuilt here:
# libkrunfw alone is a full guest kernel build. Its binaries are relinked
# against nixpkgs' libraries. crun run as `krun` is the libkrun handler,
# the runtime KVM plugins run under.
{ pkgs, lib, deb, version }:

pkgs.stdenv.mkDerivation {
  pname = "spr-krun-runtime";
  inherit version;
  src = deb;

  nativeBuildInputs = [ pkgs.dpkg pkgs.autoPatchelfHook ];
  # the .deb's Depends
  buildInputs = with pkgs; [ systemdLibs libseccomp libcap json_c stdenv.cc.cc.lib ];
  # crun dlopens libkrun.so.1 and libkrun libkrunfw.so.5: keep them on the
  # runpath the .deb gave as $ORIGIN
  appendRunpaths = [ "${placeholder "out"}/lib/spr-krun-runtime" ];

  unpackPhase = "dpkg-deb -x $src .";
  installPhase = ''
    mkdir -p $out/bin
    cp -a usr/lib usr/libexec $out/
    # crun picks its libkrun handler when invoked as krun
    ln -s ../libexec/spr-krun-runtime/krun $out/bin/krun
    ln -s ../libexec/spr-krun-runtime/krun $out/bin/crun
  '';
  doInstallCheck = true;
  installCheckPhase = ''
    for s in run.oci.spr.krun.policy /var/lib/spr-krun/policies /run/spr-krun/listen krun_set_rlimits; do
      grep -q "$s" $out/libexec/spr-krun-runtime/krun
    done
    for sym in krun_add_net_tap krun_add_vsock_port2 krun_set_rlimits; do
      $NM -D --defined-only $out/lib/spr-krun-runtime/libkrun.so.1 | grep -q " $sym$"
    done
  '';

  meta.platforms = [ "aarch64-linux" ];
  meta.description = "SPR KVM plugin runtime (the release's spr-krun-runtime .deb)";
}
