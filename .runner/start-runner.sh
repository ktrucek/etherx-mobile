#!/usr/bin/env bash
# ============================================================
#  Gitea Actions Runner Setup
#  Za kasp.top Git CI/CD
# ============================================================

set -euo pipefail

RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$RUNNER_DIR/.env"

echo "🏃 Gitea Actions Runner Setup za EtherX Mobile"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# Provjeri postoji li .env
if [[ ! -f "$ENV_FILE" ]]; then
  echo "⚠️  .env datoteka ne postoji. Kreiram template..."
  cat > "$ENV_FILE" <<'EOF'
# Gitea Actions Runner Configuration
# 
# Dobij REGISTRATION_TOKEN na:
# https://git.kasp.top/ktrucek/etherx-mobile/settings/actions/runners
# ili admin panel: https://git.kasp.top/admin/actions/runners

GITEA_REGISTRATION_TOKEN=your-registration-token-here
EOF
  echo "✅ Kreiran .env template: $ENV_FILE"
  echo
  echo "📝 VAŽNO: Uredi .env datoteku i dodaj svoj GITEA_REGISTRATION_TOKEN"
  echo "   Token dobijaš na: https://git.kasp.top/ktrucek/etherx-mobile/settings/actions/runners"
  echo
  exit 1
fi

# Učitaj .env
source "$ENV_FILE"

if [[ "$GITEA_REGISTRATION_TOKEN" == "your-registration-token-here" ]] || [[ -z "$GITEA_REGISTRATION_TOKEN" ]]; then
  echo "❌ GREŠKA: GITEA_REGISTRATION_TOKEN nije postavljen u .env"
  echo
  echo "Dobij token na:"
  echo "  https://git.kasp.top/ktrucek/etherx-mobile/settings/actions/runners"
  echo
  echo "Zatim uredi: $ENV_FILE"
  exit 1
fi

echo "✅ GITEA_REGISTRATION_TOKEN učitan iz .env"
echo

# Pokreni Docker runner
cd "$RUNNER_DIR"
echo "🐳 Pokrećem Gitea Actions Runner Docker container..."
docker compose up -d

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Gitea Actions Runner pokrenut!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "📊 Status: docker compose logs -f"
echo "🛑 Stop:   docker compose down"
echo "🔄 Restart: docker compose restart"
echo
echo "Provjeri na: https://git.kasp.top/ktrucek/etherx-mobile/settings/actions/runners"
echo
