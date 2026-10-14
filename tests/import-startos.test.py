"""Exercise the real importer against a fake SSH origin; never start an LND node."""

import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "assets/import-startos.sh"
ORIGIN = r'''#!/usr/bin/env python3
import base64, json, os, pathlib, sys, tarfile

root = pathlib.Path(os.environ['MOCK_ROOT'])
state_file = root / 'state.json'
state = json.loads(state_file.read_text())
cmd = sys.argv[-1]
prefix = ('/embassy-data/package-data/volumes/lnd/data/main' if state['layout'] == '0.3.5'
          else '/media/startos/data/package-data/volumes/lnd/data/main')

def local(path):
    if not path.startswith(prefix):
        sys.exit(1)
    return root / 'volume' / path[len(prefix):].lstrip('/')

if cmd == 'start-cli package stop lnd':
    state['stop_requested'] = True
    state_file.write_text(json.dumps(state))
elif cmd == 'start-cli db dump':
    if state['stop_requested']:
        state['polls'] += 1
        state_file.write_text(json.dumps(state))
    stopped = state['stop_requested'] and state['polls'] >= state['stop_after']
    if state['layout'] == '0.3.5':
        data = {'value': {'package-data': {'lnd': {'installed': {'status': {
            'main': {'status': 'stopped' if stopped else 'running'}}}}}}}
    else:
        data = {'value': {'packageData': {'lnd': {'statusInfo': {
            'desired': {'main': 'stopped' if state['stop_requested'] else 'running'},
            'started': None if stopped else '2026-10-13T00:00:00Z'}}}}}
    print(json.dumps(data))
elif cmd.startswith('sudo -S test '):
    parts = cmd.split()
    path = local(parts[-1])
    flag = parts[-2]
    ok = {'-d': path.is_dir, '-f': path.is_file,
          '-s': lambda: path.is_file() and path.stat().st_size > 0}[flag]()
    sys.exit(0 if ok else 1)
elif cmd.startswith('sudo -S cat '):
    sys.stdout.buffer.write(local(cmd.removeprefix('sudo -S cat ')).read_bytes())
elif cmd.startswith('sudo -S base64 '):
    sys.stdout.buffer.write(base64.encodebytes(local(cmd.removeprefix('sudo -S base64 ')).read_bytes()))
elif cmd.startswith('sudo -S tar -cf - -C '):
    if state['polls'] < state['stop_after']:
        sys.stderr.write('copied before LND stopped\n')
        sys.exit(2)
    path = local(cmd.removeprefix('sudo -S tar -cf - -C ').removesuffix(' data'))
    with tarfile.open(fileobj=sys.stdout.buffer, mode='w|') as tar:
        tar.add(path / 'data', arcname='data')
else:
    sys.stderr.write(f'unexpected mock command: {cmd}\n')
    sys.exit(2)
'''


class ImportStartosTest(unittest.TestCase):
    def run_import(self, layout, stop_after, missing_password=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            volume = root / "volume"
            wallet = volume / "data/chain/bitcoin/mainnet/wallet.db"
            channel = volume / "data/graph/mainnet/channel.db"
            wallet.parent.mkdir(parents=True)
            channel.parent.mkdir(parents=True)
            wallet.write_bytes(b"wallet fixture")
            channel.write_bytes(b"channel fixture")
            password = bytes([0x41, 0x80, 0xff, 0x0a])
            if layout == "0.3.5" and not missing_password:
                (volume / "pwd.dat").write_bytes(password)
            elif layout == "0.4" and not missing_password:
                (volume / "store.json").write_text(json.dumps({"walletPassword": "test password"}))
                (volume / "startup-flags.json").write_text("{}")

            (root / "state.json").write_text(json.dumps({
                "layout": layout, "stop_requested": False, "polls": 0,
                "stop_after": stop_after,
            }))
            bin_dir = root / "bin"
            bin_dir.mkdir()
            mock = bin_dir / "sshpass"
            mock.write_text(ORIGIN)
            mock.chmod(0o755)
            # Replace only the import subcontainer's two local output paths.
            script = (SCRIPT.read_text().replace("/root/.lnd/", f"{root}/destination/")
                      .replace("/tmp/old-store.json", f"{root}/old-store.json")
                      .replace("sleep 2", "true"))
            destination = root / "destination"
            destination.mkdir()
            env = os.environ | {
                "PATH": f"{bin_dir}:{os.environ['PATH']}", "MOCK_ROOT": str(root),
                "STARTOS_HOST": "mock", "STARTOS_PASS": "mock password",
            }
            result = subprocess.run(["busybox", "sh", "-c", script], env=env,
                                    capture_output=True, timeout=15)
            state = json.loads((root / "state.json").read_text())
            if missing_password:
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(state["stop_requested"])
                self.assertFalse((destination / "data").exists())
            elif stop_after <= 90:
                self.assertEqual(result.returncode, 0, result.stderr.decode())
                self.assertEqual((destination / "data/graph/mainnet/channel.db").read_bytes(),
                                 b"channel fixture")
                imported = json.loads((root / "old-store.json").read_text())
                if layout == "0.3.5":
                    self.assertEqual(base64.b64decode(imported["walletPasswordBase64"]), password)
                else:
                    self.assertEqual(imported["walletPassword"], "test password")
                self.assertGreaterEqual(state["polls"], stop_after)
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((destination / "data").exists())

    def test_legacy_waits_for_stop_and_preserves_password_bytes(self):
        self.run_import("0.3.5", stop_after=3)

    def test_current_layout_still_imports(self):
        self.run_import("0.4", stop_after=2)

    def test_never_copies_if_origin_does_not_stop(self):
        self.run_import("0.3.5", stop_after=91)

    def test_missing_password_fails_before_stopping_origin(self):
        self.run_import("0.3.5", stop_after=1, missing_password=True)


if __name__ == "__main__":
    unittest.main()
