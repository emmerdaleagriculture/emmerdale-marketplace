"""Validate an App Store profile and write plist/shell metadata without secrets."""
import datetime
import plistlib
import re
import shlex
import sys
from pathlib import Path

profile_path, output_path, env_path = map(Path, sys.argv[1:])
with profile_path.open("rb") as stream:
    profile = plistlib.load(stream)
team = profile["TeamIdentifier"][0]
uuid = profile["UUID"]
assert re.fullmatch(r"[A-Z0-9]{10}", team), "Invalid Apple Team ID"
assert re.fullmatch(r"[A-Fa-f0-9-]{36}", uuid), "Invalid profile UUID"
entitlements = profile["Entitlements"]
app_id = "com.emmerdaleagriculture.app"
assert entitlements["application-identifier"].endswith("." + app_id), "Profile must match the exact app ID"
assert not entitlements.get("get-task-allow", False), "Use a distribution profile, not a development profile"
assert "ProvisionedDevices" not in profile, "Use an App Store profile, not an Ad Hoc profile"
assert not profile.get("ProvisionsAllDevices", False), "Enterprise profiles cannot upload to TestFlight"
assert profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), "Provisioning profile expired"
options = {
    "method": "app-store-connect",
    "destination": "export",
    "teamID": team,
    "signingStyle": "manual",
    "signingCertificate": "Apple Distribution",
    "provisioningProfiles": {app_id: uuid},
    "uploadSymbols": True,
    "manageAppVersionAndBuildNumber": False,
}
with output_path.open("wb") as stream:
    plistlib.dump(options, stream)
env_path.write_text(f"TEAM_ID={shlex.quote(team)}\nPROFILE_UUID={shlex.quote(uuid)}\n")
print("Validated exact bundle ID, profile expiry and App Store distribution type.")
