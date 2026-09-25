#!/usr/bin/env bash
# Runs only on the macOS release runner. Never enable shell tracing.
set -euo pipefail
for name in APPSTORE_ISSUER_ID APPSTORE_KEY_ID APPSTORE_PRIVATE_KEY IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROVISIONING_PROFILE_BASE64 RUNNER_TEMP APP_BUILD_NUMBER; do
  if [ -z "${!name:-}" ]; then echo "::error::Missing $name"; exit 1; fi
done

WORK=$(mktemp -d "$RUNNER_TEMP/ios-signing.XXXXXX")
KEYCHAIN="$WORK/build.keychain-db"
PROFILE_PATH=""
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_$APPSTORE_KEY_ID.p8"
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  [ -z "$PROFILE_PATH" ] || rm -f "$PROFILE_PATH"
  rm -f "$KEY_PATH"
  rm -rf "$WORK"
}
trap cleanup EXIT
umask 077
printf '%s' "$IOS_CERTIFICATE_BASE64" | base64 --decode > "$WORK/certificate.p12"
printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" | base64 --decode > "$WORK/profile.mobileprovision"
security cms -D -i "$WORK/profile.mobileprovision" > "$WORK/profile.plist"

# Validate the profile and create explicit export options rather than relying
# on a logged-in Xcode account or implicit signing defaults.
python3 scripts/ios-export-options.py "$WORK/profile.plist" "$WORK/ExportOptions.plist" "$WORK/profile.env"
source "$WORK/profile.env"
PROFILE_PATH="$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
mkdir -p "$(dirname "$PROFILE_PATH")"
cp "$WORK/profile.mobileprovision" "$PROFILE_PATH"

KEYCHAIN_PASSWORD=$(openssl rand -hex 24)
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$WORK/certificate.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN"
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db"

xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$WORK/App.xcarchive" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
  DEVELOPMENT_TEAM="$TEAM_ID" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
  CURRENT_PROJECT_VERSION="$APP_BUILD_NUMBER" MARKETING_VERSION=1.0.0 archive
xcodebuild -exportArchive -archivePath "$WORK/App.xcarchive" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -exportPath "$RUNNER_TEMP/ios-export"

mkdir -p "$(dirname "$KEY_PATH")"
printf '%s' "$APPSTORE_PRIVATE_KEY" > "$KEY_PATH"
IPA=$(find "$RUNNER_TEMP/ios-export" -maxdepth 1 -name '*.ipa' -print -quit)
test -n "$IPA"
xcrun altool --validate-app -f "$IPA" -t ios --apiKey "$APPSTORE_KEY_ID" --apiIssuer "$APPSTORE_ISSUER_ID"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$APPSTORE_KEY_ID" --apiIssuer "$APPSTORE_ISSUER_ID"
