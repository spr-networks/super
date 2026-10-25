#!/usr/bin/env python3
"""Dual-kernel fetch/boot regression tests; requires Linux, bash and jq.

Run: python3 -m unittest discover -s installer/raspbian/tests -v
No network, root privileges, real packages or mounted images are used.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
TAG = "v6.18.57-1"
PI4 = "6.18.57-v8+"
PI5 = "6.18.57-v8-16k+"

MOCK = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
fixtures = pathlib.Path(os.environ["FIXTURES"])
if pathlib.Path(sys.argv[0]).name == "gh":
    assert args[:2] == ["attestation", "verify"]
    assert args[args.index("--source-ref") + 1] == "refs/tags/v6.18.57-1"
    assert args[args.index("--repo") + 1] == "spr-networks/spr-debian-kernel"
    assert args[args.index("--signer-workflow") + 1].endswith("/.github/workflows/build-kernel.yml")
    sys.exit(1 if os.environ.get("FAIL_VERIFY") else 0)
url = args[-1]
if url.endswith("/releases/latest"):
    content = (fixtures / "pi5.json").read_bytes()
elif url.endswith("/releases/tags/pi4-v6.18.57-1"):
    if os.environ.get("MISSING_PI4"):
        sys.exit(22)
    content = (fixtures / "pi4.json").read_bytes()
elif "/attestations/sha256:" in url:
    content = b'{"attestations":[{"bundle":{"test":true}}]}'
elif url.startswith("https://assets.example/"):
    content = url.encode()
else:
    sys.exit("unexpected URL: " + url)
if "-o" in args:
    pathlib.Path(args[args.index("-o") + 1]).write_bytes(content)
else:
    sys.stdout.buffer.write(content)
'''


class KernelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ("curl", "gh"):
            script = self.bin / name
            script.write_text(MOCK)
            script.chmod(0o755)
        self.env = dict(os.environ, FIXTURES=str(self.root),
                        PATH=str(self.bin) + os.pathsep + os.environ["PATH"])
        for flavor, kver, tag in (("pi4", PI4, "pi4-" + TAG), ("pi5", PI5, TAG)):
            names = [f"linux-image-{kver}_1.rpi.trixie_arm64.deb",
                     f"linux-headers-{kver}_1.rpi.trixie_arm64.deb",
                     "linux-libc-dev_1.rpi.trixie_arm64.deb"]
            (self.root / f"{flavor}.json").write_text(json.dumps({
                "tag_name": tag,
                "assets": [{"name": n, "browser_download_url":
                            f"https://assets.example/{flavor}/{n}"} for n in names]}))

    def fetch(self, mode=None, **env):
        cmd = ["bash", str(SCRIPTS / "fetch-spr-kernel.sh"), str(self.root / "debs")]
        if mode:
            cmd.append(mode)
        return subprocess.run(cmd, env=dict(self.env, **env), text=True, capture_output=True)

    def test_default_preserves_pi5_only_layout(self):
        result = self.fetch()
        self.assertEqual(result.returncode, 0, result.stderr)
        debs = list((self.root / "debs").glob("*.deb"))
        self.assertEqual(len(debs), 3)
        self.assertTrue(all("pi5" in p.read_text() for p in debs))
        self.assertFalse((self.root / "debs/pi4").exists())

    def test_both_uses_parent_attestation_ref_and_separate_libc_packages(self):
        result = self.fetch("both")
        self.assertEqual(result.returncode, 0, result.stderr)
        for flavor in ("pi4", "pi5"):
            debs = list((self.root / "debs" / flavor).glob("*.deb"))
            self.assertEqual(len(debs), 3)
            self.assertTrue(all(flavor in p.read_text() for p in debs))

    def test_missing_pi4_fails_without_publishing_partial_pair(self):
        self.assertNotEqual(self.fetch("both", MISSING_PI4="1").returncode, 0)
        self.assertFalse((self.root / "debs").exists())

    def test_wrong_pi4_version_is_rejected(self):
        path = self.root / "pi4.json"
        path.write_text(path.read_text().replace(PI4, "6.18.55-v8+"))
        self.assertNotEqual(self.fetch("both").returncode, 0)
        self.assertFalse((self.root / "debs").exists())

    def test_failed_attestation_is_rejected(self):
        self.assertNotEqual(self.fetch("both", FAIL_VERIFY="1").returncode, 0)
        self.assertFalse((self.root / "debs").exists())

    def boot_fixture(self):
        root = self.root / "image"
        boot = root / "boot/firmware"
        boot.mkdir(parents=True)
        (boot / "config.txt").write_text("# keep me\n[pi4]\nkernel=old.img\n")
        for kver, size, chip in ((PI4, "4K", "bcm2711"), (PI5, "16K", "bcm2712")):
            (root / f"boot/config-{kver}").write_text(f"CONFIG_ARM64_{size}_PAGES=y\n")
            (root / f"boot/vmlinuz-{kver}").write_text(f"kernel-{size}")
            (root / f"boot/initrd.img-{kver}").write_text(f"initrd-{size}")
            (root / f"lib/modules/{kver}").mkdir(parents=True)
            dtbs = root / f"usr/lib/linux-image-{kver}/broadcom"
            dtbs.mkdir(parents=True)
            (dtbs / f"{chip}-rpi.dtb").write_text(chip)
            overlays = dtbs.parent / "overlays"
            overlays.mkdir()
            (overlays / "test.dtbo").write_text("overlay")
        return root, boot

    def setup_boot(self, root, pi4=PI4, pi5=PI5):
        return subprocess.run(["bash", str(SCRIPTS / "setup-spr-boot.sh"), pi4, pi5, str(root)],
                              text=True, capture_output=True)

    def test_boot_pair_and_model_selection_are_distinct_and_idempotent(self):
        root, boot = self.boot_fixture()
        for _ in range(2):
            result = self.setup_boot(root)
            self.assertEqual(result.returncode, 0, result.stderr)
        for name, value in {"kernel8.img": "kernel-4K", "initramfs8": "initrd-4K",
                            "kernel_2712.img": "kernel-16K", "initramfs_2712": "initrd-16K"}.items():
            self.assertEqual((boot / name).read_text(), value)
        for chip in ("bcm2711", "bcm2712"):
            self.assertTrue((boot / f"{chip}-rpi.dtb").exists())
        config = (boot / "config.txt").read_text()
        self.assertEqual(config.count("# BEGIN SPR KERNELS"), 1)
        self.assertIn("# keep me", config)
        # A minimal evaluator for the filters/settings this helper writes.
        for model, kernel in (("pi4", "kernel8.img"), ("pi5", "kernel_2712.img")):
            active, settings = True, {}
            for line in config.splitlines():
                if line.startswith("["):
                    active = line in ("[all]", f"[{model}]")
                elif active and "=" in line:
                    key, value = line.split("=", 1)
                    settings[key] = value
            self.assertEqual(settings["kernel"], kernel)
            self.assertEqual(settings["auto_initramfs"], "1")

    def test_missing_initramfs_fails_before_overwriting_boot(self):
        root, boot = self.boot_fixture()
        (root / f"boot/initrd.img-{PI4}").unlink()
        self.assertNotEqual(self.setup_boot(root).returncode, 0)
        self.assertFalse((boot / "kernel8.img").exists())

    def test_wrong_page_size_fails_before_overwriting_boot(self):
        root, boot = self.boot_fixture()
        (root / f"boot/config-{PI4}").write_text("CONFIG_ARM64_16K_PAGES=y\n")
        self.assertNotEqual(self.setup_boot(root).returncode, 0)
        self.assertFalse((boot / "kernel8.img").exists())

    def test_mismatched_versions_are_rejected(self):
        root, boot = self.boot_fixture()
        self.assertNotEqual(self.setup_boot(root, pi5="6.18.58-v8-16k+").returncode, 0)
        self.assertFalse((boot / "kernel8.img").exists())


if __name__ == "__main__":
    unittest.main()
