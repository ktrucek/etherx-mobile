#!/usr/bin/env bash
# ============================================================
#  EtherX Mobile — Remote iOS Build Script
#  Builda iOS IPA na remote Mac računalu preko SSH
#
#  Usage:
#    ./build-ios-remote.sh              → build i preuzmi IPA
#    ./build-ios-remote.sh --upload     → build, preuzmi i upload na kasp.top
#
#  Prerekviziti:
#   - SSH pristup Mac računalu s ključem (bez passworda)
#   - Xcode instaliran na Mac-u
#   - CocoaPods instaliran na Mac-u
#   - Node.js instaliran na Mac-u
# ============================================================

set -euo pipefail

# ── Konfiguracija ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Mac SSH konfiguracija - PRILAGODI OVE VRIJEDNOSTI
MAC_SSH_USER="kriptoentuzijasti.io"
MAC_SSH_HOST="192.168.1.186"
MAC_SSH_PORT="22"
MAC_BUILD_DIR="~/etherx-mobile-build"

# Lokalna konfiguracija
LOCAL_REPO_DIR="$SCRIPT_DIR"
OUTPUT_DIR="$SCRIPT_DIR/build/ios"

# Opcije
UPLOAD_TO_KASP=false

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD_TO_KASP=true ;;
    --help|-h)
      echo "Koristenje: ./build-ios-remote.sh [--upload]"
      echo "  --upload   Upload IPA na kasp.top Git release artifacts"
      exit 0 ;;
  esac
done

# ── Boje ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[ios-build]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── 0. Provjere ──────────────────────────────────────────────────────────────
info "Provjeravam SSH konfiguraciju..."

if [[ "$MAC_SSH_USER" == "your-mac-username" ]] || [[ "$MAC_SSH_HOST" == "your-mac-ip-or-hostname" ]]; then
  error "Mораš konfigurirati MAC_SSH_USER i MAC_SSH_HOST na vrhu skripte!"
fi

# Test SSH konekcije
if ! ssh -p "$MAC_SSH_PORT" -o ConnectTimeout=5 -o BatchMode=yes "${MAC_SSH_USER}@${MAC_SSH_HOST}" "echo 'SSH OK'" &>/dev/null; then
  error "Ne mogu se spojiti na Mac preko SSH. Provjeri:\n  - SSH ključ je dodan (ssh-copy-id)\n  - Mac SSH server radi (System Settings > Sharing > Remote Login)\n  - Firewall dozvoljava SSH\n  - IP/hostname je točan: ${MAC_SSH_HOST}"
fi

success "SSH konekcija uspješna: ${MAC_SSH_USER}@${MAC_SSH_HOST}"

# ── 1. Sinkronizacija koda na Mac ────────────────────────────────────────────
info "Sinkroniziram kod na Mac..."

ssh -p "$MAC_SSH_PORT" "${MAC_SSH_USER}@${MAC_SSH_HOST}" "mkdir -p $MAC_BUILD_DIR"

rsync -avz --delete \
  -e "ssh -p $MAC_SSH_PORT" \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'android/' \
  --exclude 'build/' \
  --exclude '.gradle/' \
  --exclude 'ios/build/' \
  --exclude 'ios/Pods/' \
  "$LOCAL_REPO_DIR/" \
  "${MAC_SSH_USER}@${MAC_SSH_HOST}:${MAC_BUILD_DIR}/"

success "Kod sinkroniziran na Mac"

# ── 2. Remote build na Mac-u ─────────────────────────────────────────────────
info "Pokrećem iOS build na Mac-u..."

ssh -p "$MAC_SSH_PORT" "${MAC_SSH_USER}@${MAC_SSH_HOST}" "bash -l" <<'REMOTE_SCRIPT'
set -euo pipefail

cd ~/etherx-mobile-build

echo "📦 Instaliram Node dependencies..."
npm ci

echo "💎 Instaliram CocoaPods..."
cd ios
pod install --repo-update
cd ..

echo "🏗️ Buildам iOS archive..."
cd ios
xcodebuild archive \
  -workspace EtherXMobile.xcworkspace \
  -scheme EtherXMobile \
  -configuration Release \
  -archivePath "$PWD/build/EtherXMobile.xcarchive" \
  -destination 'generic/platform=iOS' \
  -sdk iphoneos \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  TARGETED_DEVICE_FAMILY="1,2" \
  | xcpretty || cat

echo "📦 Kreiram IPA..."
mkdir -p build/ipa
cp -r build/EtherXMobile.xcarchive/Products/Applications/EtherXMobile.app build/ipa/
cd build/ipa
mkdir Payload
mv EtherXMobile.app Payload/
zip -r EtherXMobile-universal.ipa Payload/
mv EtherXMobile-universal.ipa ../

echo "✅ iOS build gotov!"
ls -lh build/EtherXMobile-universal.ipa
REMOTE_SCRIPT

if [[ $? -ne 0 ]]; then
  error "iOS build na Mac-u neuspješan. Provjeri gornje logove."
fi

success "iOS build na Mac-u uspješan"

# ── 3. Preuzimanje IPA-a ─────────────────────────────────────────────────────
info "Preuzimam IPA s Mac-a..."

mkdir -p "$OUTPUT_DIR"

scp -P "$MAC_SSH_PORT" \
  "${MAC_SSH_USER}@${MAC_SSH_HOST}:${MAC_BUILD_DIR}/ios/build/EtherXMobile-universal.ipa" \
  "$OUTPUT_DIR/EtherXMobile-universal.ipa"

IPA_SIZE=$(du -h "$OUTPUT_DIR/EtherXMobile-universal.ipa" | cut -f1)
success "IPA preuzet: $OUTPUT_DIR/EtherXMobile-universal.ipa ($IPA_SIZE)"

# ── 4. Upload na kasp.top (opciono) ──────────────────────────────────────────
if [[ "$UPLOAD_TO_KASP" == true ]]; then
  info "Upload IPA-a na kasp.top..."
  
  # Ovo zahtijeva kasp.top API za upload artifacts
  # Možeš dodati implementaciju ovdje ili koristiti git release
  
  warn "Upload na kasp.top još nije implementiran - koristi ručni upload"
fi

# ── 5. Cleanup na Mac-u ──────────────────────────────────────────────────────
info "Čistim build artefakte na Mac-u..."
ssh -p "$MAC_SSH_PORT" "${MAC_SSH_USER}@${MAC_SSH_HOST}" \
  "rm -rf ${MAC_BUILD_DIR}/ios/build"

# ── 6. Završetak ─────────────────────────────────────────────────────────────
echo
success "════════════════════════════════════════════════════════"
success "  iOS build završen!"
success "════════════════════════════════════════════════════════"
info "IPA lokacija:  $OUTPUT_DIR/EtherXMobile-universal.ipa"
info "IPA veličina:  $IPA_SIZE"
info ""
info "Za instalaciju na iOS uređaj:"
info "  1. Kopiraj IPA na iOS uređaj"
info "  2. Instaliraj putem iTunes ili Xcode Devices"
info "  3. Ili koristi AltStore/Sideloadly za sideload"
success "════════════════════════════════════════════════════════"
