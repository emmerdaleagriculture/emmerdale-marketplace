import datetime
import plistlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ExportOptionsTest(unittest.TestCase):
    def profile(self):
        return {
            "TeamIdentifier": ["ABCDEFGHIJ"],
            "UUID": "12345678-1234-1234-1234-123456789abc",
            "ExpirationDate": datetime.datetime(2099, 1, 1),
            "Entitlements": {
                "application-identifier": "ABCDEFGHIJ.com.emmerdaleagriculture.app",
                "get-task-allow": False,
            },
        }

    def run_profile(self, profile):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "input.plist").write_bytes(plistlib.dumps(profile))
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("ios-export-options.py")),
                 str(root / "input.plist"), str(root / "export.plist"), str(root / "profile.env")],
                capture_output=True, text=True,
            )
            options = plistlib.loads((root / "export.plist").read_bytes()) if result.returncode == 0 else None
            return result, options

    def test_valid(self):
        result, options = self.run_profile(self.profile())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(options["method"], "app-store-connect")
        self.assertEqual(options["provisioningProfiles"]["com.emmerdaleagriculture.app"],
                         "12345678-1234-1234-1234-123456789abc")

    def test_invalid_profiles(self):
        for mutation in [
            {"ExpirationDate": datetime.datetime(2000, 1, 1)},
            {"ProvisionedDevices": ["device"]},
            {"ProvisionsAllDevices": True},
            {"TeamIdentifier": ["bad;echo injected"]},
            {"UUID": "$(echo injected)"},
            {"Entitlements": {"application-identifier": "ABCDEFGHIJ.other.app"}},
            {"Entitlements": {"application-identifier": "ABCDEFGHIJ.com.emmerdaleagriculture.app", "get-task-allow": True}},
        ]:
            with self.subTest(mutation=mutation):
                result, _ = self.run_profile({**self.profile(), **mutation})
                self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
