#!/usr/bin/env bash
# ============================================================
#  EtherX Mobile — Deploy Script (kasp.top Git)
#  Repozitorij: https://git.kasp.top/ktrucek/etherx-mobile
#
#  Usage:
#    ./deploy-kasp-mob.sh              → auto-increment patch version
#    ./deploy-kasp-mob.sh 1.2.0        → postavi specificnu verziju
#    ./deploy-kasp-mob.sh --no-push    → commit + lokalni fix, bez push
#    ./deploy-kasp-mob.sh --sync       → samo sinkronizira repo s kasp.top
#
#  Što radi:
#   1. Provjeri/klonira etherx-mobile repo (../etherx-mobile)
#   2. Fixa Android build grešku: rn_edit_text_material drawable
#   3. Bumpa verziju u package.json, Android i iOS build metadata
#   4. Instalira dependencyje i radi lokalni Android release build
#   5. git commit + tag vX.Y.Z
#   6. git push → CI/CD builda Android + iOS artefakte
# ============================================================

set -euo pipefail

# ── Konfiguracija ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# kasp.top Git konfiguracija
KASP_TOKEN="2b80530e283cdd018d25e430a25f90eaaf460694"
KASP_GIT_URL="https://git.kasp.top/ktrucek/etherx-mobile.git"
KASP_GIT_URL_WITH_TOKEN="https://${KASP_TOKEN}@git.kasp.top/ktrucek/etherx-mobile.git"

find_mobile_dir() {
  local candidate
  local script_parent
  script_parent="$(dirname "$SCRIPT_DIR")"

  for candidate in \
    "$SCRIPT_DIR" \
    "$PWD" \
    "$script_parent/etherx-mobile" \
    "$script_parent/browser/../etherx-mobile" \
    "$script_parent/AI projekt/etherx-mobile" \
    "$script_parent/../AI projekt/etherx-mobile"
  do
    if [[ -f "$candidate/package.json" && -d "$candidate/android" && -d "$candidate/ios" ]]; then
      cd "$candidate" >/dev/null 2>&1 && pwd
      return 0
    fi
  done

  return 1
}

MOBILE_DIR="$(find_mobile_dir || true)"
MOBILE_REPO="$KASP_GIT_URL_WITH_TOKEN"
DEPLOY_OWNER="kriptoen:psacln"
BUILD_LOCAL=true
ANDROID_ONLY=false
IOS_ONLY=false
SKIP_BUILD=false
DEMO_MODE=false
SKIP_GIT=false
DEFAULT_APP_NAME="EtherX Browser"
DEMO_APP_NAME="EtherX Browser Demo"
DEFAULT_INITIAL_URL="https://n8n.kriptoentuzijasti.io/browser.html"
DEMO_INITIAL_URL="https://n8n.kriptoentuzijasti.io/browser.html?demo=1"

# ── Parse args ────────────────────────────────────────────────────────────────
NO_PUSH=false
SYNC_ONLY=false
REQUESTED_VERSION=""
for arg in "$@"; do
  case "$arg" in
    --no-push)    NO_PUSH=true ;;
    --sync)       SYNC_ONLY=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --android-only) ANDROID_ONLY=true ;;
    --ios-only)   IOS_ONLY=true ;;
    --demo)       DEMO_MODE=true ;;
    --help|-h)
      echo "Koristenje: ./deploy-kasp-mob.sh [VERZIJA] [--demo] [--no-push] [--sync] [--skip-build] [--android-only] [--ios-only]"
      echo "  VERZIJA    npr. 1.2.1  (default: auto-increment patch)"
      echo "  --demo     Pripremi test/demo naziv aplikacije i demo početni URL"
      echo "  --no-push  Preskoči git push (samo lokalni commit)"
      echo "  --sync     Samo sinkroniziraj repo s kasp.top, bez deploya"
      echo "  --skip-build   Preskoči lokalni build korak"
      echo "  --android-only Lokalno radi samo Android korake"
      echo "  --ios-only     Preskoči Android lokalni build i fokusiraj iOS provjere/CI"
      exit 0 ;;
    *)  REQUESTED_VERSION="$arg" ;;
  esac
done

# ── Boje ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[kasp-mob]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

if [[ "$ANDROID_ONLY" == true && "$IOS_ONLY" == true ]]; then
  error "Ne možeš koristiti --android-only i --ios-only zajedno"
fi

if [[ "$DEMO_MODE" == true && "$NO_PUSH" == false ]]; then
  warn "Demo mode uključen — automatski postavljam --no-push za lokalno testiranje"
  NO_PUSH=true
fi

if [[ "$DEMO_MODE" == true ]]; then
  SKIP_GIT=true
fi

# ── 0. Pre-flight provjere ────────────────────────────────────────────────────
info "Pre-flight provjere..."
command -v git     &>/dev/null || error "git nije instaliran"
command -v node    &>/dev/null || error "node nije instaliran"
command -v python3 &>/dev/null || error "python3 nije instaliran"
command -v npm     &>/dev/null || error "npm nije instaliran"

if [[ -z "$MOBILE_DIR" ]]; then
  error "Ne mogu pronaći etherx-mobile root. Pokreni skriptu iz repoa ili koristi datoteku unutar /etherx-mobile."
fi

info "Repo root detektiran: $MOBILE_DIR"

CURRENT_BRANCH="$(git -C "$MOBILE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
REMOTE_HEAD_REF="$(git -C "$MOBILE_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
REMOTE_DEFAULT_BRANCH="${REMOTE_HEAD_REF#origin/}"

if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "HEAD" ]]; then
  PUSH_BRANCH="$CURRENT_BRANCH"
elif [[ -n "$REMOTE_DEFAULT_BRANCH" ]]; then
  PUSH_BRANCH="$REMOTE_DEFAULT_BRANCH"
else
  PUSH_BRANCH="main"
fi

info "Git push branch: $PUSH_BRANCH"

# ── 1. Kloniranje / sinkronizacija repozitorija ───────────────────────────────
if [[ ! -d "$MOBILE_DIR/.git" ]]; then
  warn "etherx-mobile repo nije pronađen lokalno — kloniram s kasp.top..."
  info "Ciljni folder: $MOBILE_DIR"
  mkdir -p "$(dirname "$MOBILE_DIR")"
  git clone "$MOBILE_REPO" "$MOBILE_DIR"
  success "Klonirano u: $MOBILE_DIR"
else
  info "etherx-mobile repo pronađen: $MOBILE_DIR"
  cd "$MOBILE_DIR"
  
  # Provjeri da li je kasp.top remote već postavljen
  CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [[ "$CURRENT_REMOTE" != *"git.kasp.top"* ]]; then
    warn "Remote origin pokazuje na $CURRENT_REMOTE, mijenjam u kasp.top..."
    git remote set-url origin "$KASP_GIT_URL_WITH_TOKEN"
    success "Remote origin postavljen na kasp.top"
  fi
  
  info "Dohvaćam zadnje izmjene s kasp.top..."
  git fetch origin
  # Sinkroniziraj samo ako nema lokalnih izmjena koje bi se izgubile
  DIRTY=$(git status --porcelain 2>/dev/null | grep -v "^??" || true)
  if [[ -z "$DIRTY" ]]; then
    git pull origin main --ff-only 2>/dev/null || \
    git pull origin master --ff-only 2>/dev/null || \
    warn "Pull nije uspio (možda nema remote main/master grane)"
    success "Repo sinkroniziran s kasp.top"
  else
    warn "Ima lokalnih izmjena — preskačem pull, koristim lokalne izmjene"
  fi
fi

if [[ "$SYNC_ONLY" == true ]]; then
  success "Sinkronizacija završena. Folder: $MOBILE_DIR"
  exit 0
fi

cd "$MOBILE_DIR"

# ── 1b. Postavi app mode (demo/release) ─────────────────────────────────────
if [[ "$DEMO_MODE" == true ]]; then
  APP_NAME="$DEMO_APP_NAME"
  MODE_BADGE="Demo"
  MODE_URL="$DEMO_INITIAL_URL"
  DEMO_MODE_PY=true
else
  APP_NAME="$DEFAULT_APP_NAME"
  MODE_BADGE="Mobile"
  MODE_URL="$DEFAULT_INITIAL_URL"
  DEMO_MODE_PY=false
fi

info "Postavljam app mode → ${APP_NAME}"
python3 - <<PYEOF
from pathlib import Path
import re

mode_path = Path('mobile-mode.ts')
content = mode_path.read_text(encoding='utf-8')
content = re.sub(r"demoMode:\s*(true|false)", "demoMode: $DEMO_MODE_PY", content, count=1)
content = re.sub(r"appDisplayName:\s*'[^']*'", "appDisplayName: '$APP_NAME'", content, count=1)
content = re.sub(r"titleLabel:\s*'[^']*'", "titleLabel: '$APP_NAME'", content, count=1)
content = re.sub(r"badgeLabel:\s*'[^']*'", "badgeLabel: '$MODE_BADGE'", content, count=1)
content = re.sub(r"initialUrl:\s*'[^']*'", "initialUrl: '$MODE_URL'", content, count=1)
mode_path.write_text(content, encoding='utf-8')
print('  mobile-mode.ts ažuriran')
PYEOF

python3 - <<PYEOF
import json
path = 'app.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
data['displayName'] = '$APP_NAME'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('  app.json displayName ažuriran')
PYEOF

python3 - <<PYEOF
from pathlib import Path
path = Path('android/app/src/main/res/values/strings.xml')
text = path.read_text(encoding='utf-8')
text = text.replace('<string name="app_name">EtherX Browser</string>', '<string name="app_name">$APP_NAME</string>')
text = text.replace('<string name="app_name">EtherX Browser Demo</string>', '<string name="app_name">$APP_NAME</string>')
path.write_text(text, encoding='utf-8')
print('  Android app_name ažuriran')
PYEOF

python3 - <<PYEOF
import plistlib
path = 'ios/EtherXMobile/Info.plist'
with open(path, 'rb') as f:
    data = plistlib.load(f)
data['CFBundleDisplayName'] = '$APP_NAME'
with open(path, 'wb') as f:
    plistlib.dump(data, f)
print('  iOS CFBundleDisplayName ažuriran')
PYEOF

# ── 2. Fix Android build greške: rn_edit_text_material ───────────────────────
info "Provjeravam Android drawable resurse..."

DRAWABLE_DIR="android/app/src/main/res/drawable"
DRAWABLE_FILE="${DRAWABLE_DIR}/rn_edit_text_material.xml"
STYLES_FILE="android/app/src/main/res/values/styles.xml"

mkdir -p "$DRAWABLE_DIR"

# Provjeri koristi li styles.xml ovaj drawable
if [[ -f "$STYLES_FILE" ]] && grep -q "rn_edit_text_material" "$STYLES_FILE"; then
  if [[ ! -f "$DRAWABLE_FILE" ]]; then
    info "Kreiram nedostajući drawable: rn_edit_text_material.xml"
    cat > "$DRAWABLE_FILE" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<!--
  rn_edit_text_material.xml
  Standardni Material EditText background drawable za React Native.
  Potreban kada styles.xml referencira android:editTextBackground="@drawable/rn_edit_text_material"
-->
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:insetLeft="@dimen/abc_edit_text_inset_horizontal_material"
    android:insetRight="@dimen/abc_edit_text_inset_horizontal_material"
    android:insetTop="@dimen/abc_edit_text_inset_top_material"
    android:insetBottom="@dimen/abc_edit_text_inset_bottom_material">
  <selector>
    <item android:state_enabled="false">
      <nine-patch android:src="@drawable/abc_textfield_default_mtrl_alpha"
          android:alpha="?android:attr/disabledAlpha"
          android:tint="?attr/colorControlNormal"/>
    </item>
    <item>
      <nine-patch android:src="@drawable/abc_textfield_default_mtrl_alpha"
          android:tint="?attr/colorControlNormal"/>
    </item>
  </selector>
</inset>
XMLEOF
    success "Kreiran rn_edit_text_material.xml"
  else
    success "rn_edit_text_material.xml već postoji"
  fi
else
  info "styles.xml ne koristi rn_edit_text_material → preskačem kreiranje"
fi

# ── 3. Izračun verzije ───────────────────────────────────────────────────────
PACKAGE_JSON="package.json"
if [[ ! -f "$PACKAGE_JSON" ]]; then
  error "package.json nije pronađen u $MOBILE_DIR"
fi

CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version" 2>/dev/null || echo "0.0.0")
info "Trenutna verzija: $CURRENT_VERSION"

if [[ -z "$REQUESTED_VERSION" ]]; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
  info "Auto-increment → $NEW_VERSION"
else
  NEW_VERSION="$REQUESTED_VERSION"
  info "Korisnik zatražio verziju → $NEW_VERSION"
fi

# ── 4. Bump verziju u package.json ──────────────────────────────────────────
info "Postavljam verziju $NEW_VERSION u package.json..."
python3 - <<PYEOF
import json
path = '$PACKAGE_JSON'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
data['version'] = '$NEW_VERSION'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('  package.json verzija postavljena na $NEW_VERSION')
PYEOF

# ── 5. Bump Android verziju (versionCode + versionName) ──────────────────────
if [[ "$IOS_ONLY" == false ]]; then
  info "Postavljam Android verziju..."
  ANDROID_BUILD_GRADLE="android/app/build.gradle"
  if [[ ! -f "$ANDROID_BUILD_GRADLE" ]]; then
    warn "android/app/build.gradle nije pronađen, preskačem Android verziju"
  else
    # Pročitaj trenutni versionCode
    CURRENT_CODE=$(grep -oP 'versionCode\s+\K\d+' "$ANDROID_BUILD_GRADLE" || echo "1")
    NEW_CODE=$((CURRENT_CODE + 1))

    python3 - <<PYEOF
import re
path = '$ANDROID_BUILD_GRADLE'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'versionCode\s+\d+', 'versionCode $NEW_CODE', content, count=1)
content = re.sub(r'versionName\s+"[^"]+"', 'versionName "$NEW_VERSION"', content, count=1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('  Android versionCode → $NEW_CODE, versionName → $NEW_VERSION')
PYEOF
  fi
fi

# ── 6. Bump iOS verziju (CFBundleShortVersionString + CFBundleVersion) ───────
if [[ "$ANDROID_ONLY" == false ]]; then
  info "Postavljam iOS verziju..."
  IOS_INFO_PLIST="ios/EtherXMobile/Info.plist"
  if [[ ! -f "$IOS_INFO_PLIST" ]]; then
    warn "ios/EtherXMobile/Info.plist nije pronađen, preskačem iOS verziju"
  else
    python3 - <<PYEOF
import plistlib
path = '$IOS_INFO_PLIST'
with open(path, 'rb') as f:
    data = plistlib.load(f)

data['CFBundleShortVersionString'] = '$NEW_VERSION'
# iOS CFBundleVersion može biti broj build-a
current_build = int(data.get('CFBundleVersion', '1'))
new_build = current_build + 1
data['CFBundleVersion'] = str(new_build)

with open(path, 'wb') as f:
    plistlib.dump(data, f)

print(f'  iOS CFBundleShortVersionString → $NEW_VERSION, CFBundleVersion → {new_build}')
PYEOF
  fi
fi

success "Verzija postavljena na $NEW_VERSION"

# ── 7. Instalacija dependencyja ─────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  info "Instaliram Node dependencies (npm ci)..."
  npm ci --silent
  success "Node dependencies instalirani"
fi

# ── 8. Lokalni Android build (assembleRelease) ───────────────────────────────
if [[ "$SKIP_BUILD" == false && "$IOS_ONLY" == false ]]; then
  info "Pokrećem lokalni Android build (assembleRelease)..."
  cd android
  chmod +x gradlew
  ./gradlew assembleRelease --no-daemon --stacktrace || {
    error "Android build neuspješan. Provjeri logove."
  }
  cd ..
  
  APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
  if [[ -f "$APK_PATH" ]]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    success "Android APK build uspješan: $APK_PATH ($APK_SIZE)"
  else
    warn "APK nije pronađen na $APK_PATH — možda build nije potpuno uspio"
  fi
fi

# ── 9. Git commit + tag ──────────────────────────────────────────────────────
if [[ "$SKIP_GIT" == false ]]; then
  info "Git commit..."
  git add -A
  git diff --cached --quiet && {
    warn "Nema izmjena za commit — preskačem"
  } || {
    git commit -m "v${NEW_VERSION}: Deploy EtherX Mobile" || true
    success "Commit kreiran: v${NEW_VERSION}"
  }

  TAG="v${NEW_VERSION}"
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    warn "Tag $TAG već postoji — preskačem kreiranje taga"
  else
    git tag -a "$TAG" -m "Release $NEW_VERSION"
    success "Tag kreiran: $TAG"
  fi
fi

# ── 10. Git push ─────────────────────────────────────────────────────────────
if [[ "$NO_PUSH" == false && "$SKIP_GIT" == false ]]; then
  info "Pushanjem na kasp.top Git..."
  git push origin "$PUSH_BRANCH" --tags || {
    error "Git push neuspješan. Provjeri mrežnu vezu i pristupne podatke."
  }
  success "Pushano na kasp.top: branch $PUSH_BRANCH + tagovi"
  info "CI/CD build pokrenut na kasp.top Git"
else
  warn "Preskaču git push (NO_PUSH=$NO_PUSH, SKIP_GIT=$SKIP_GIT)"
fi

# ── 11. Završetak ───────────────────────────────────────────────────────────
echo
success "════════════════════════════════════════════════════════"
success "  Deployment završen!"
success "════════════════════════════════════════════════════════"
info "Verzija:       $NEW_VERSION"
info "Git repo:      $KASP_GIT_URL"
info "Branch:        $PUSH_BRANCH"
if [[ "$SKIP_BUILD" == false && "$IOS_ONLY" == false ]]; then
  info "Android APK:   $APK_PATH"
fi
if [[ "$NO_PUSH" == false && "$SKIP_GIT" == false ]]; then
  info "CI/CD:         Provjeri build status na kasp.top Git web UI"
fi
success "════════════════════════════════════════════════════════"
