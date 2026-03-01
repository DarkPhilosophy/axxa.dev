#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_ROOT="$(cd "$ROOT/.." && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)/web-build"
LINK_MODE="${LINK_MODE:-1}"

link_or_copy() {
  local src="$1"
  local dst="$2"
  if [ "$LINK_MODE" = "1" ]; then
    ln -sfn "$src" "$dst"
  else
    cp "$src" "$dst"
  fi
}

rm -rf "$OUT"
mkdir -p "$OUT/cafea" "$OUT/dist"

cp "$ROOT/index.html" "$OUT/index.html"
link_or_copy "$ROOT/app.js" "$OUT/cafea/app.js"
link_or_copy "$ROOT/app.css" "$OUT/cafea/app.css"
link_or_copy "$SITE_ROOT/styles.css" "$OUT/styles.css"
link_or_copy "$SITE_ROOT/script.js" "$OUT/script.js"
link_or_copy "$SITE_ROOT/config.json" "$OUT/config.json"
link_or_copy "$SITE_ROOT/dist/tailwind.css" "$OUT/dist/tailwind.css"
link_or_copy "$SITE_ROOT/favicon.svg" "$OUT/favicon.svg"

python3 - <<'PY'
from pathlib import Path
p = Path('web-build/index.html')
s = p.read_text()
s = s.replace("window.CAFEA_API_BASE = '/api';", "window.CAFEA_API_BASE = 'https://cafea.axxa.dev/api';")
s = s.replace(
    'if (["cafe.axxa.dev", "cafea.axxa.dev", "zeul.go.ro"].includes(window.location.hostname)) {',
    'if (["cafe.axxa.dev", "cafea.axxa.dev", "zeul.go.ro", "localhost", "127.0.0.1"].includes(window.location.hostname)) {'
)
s = s.replace(
    '</body>',
    '''
<style id="android-app-shell">
  body.cafe-app-only { background:#0b1020 !important; }
  body.cafe-app-only #splash-screen,
  body.cafe-app-only #preloader,
  body.cafe-app-only .fixed.inset-0.pointer-events-none.z-\\[-1\\].overflow-hidden,
  body.cafe-app-only #scrollToTopBtn,
  body.cafe-app-only #project-modal,
  body.cafe-app-only #article-modal,
  body.cafe-app-only #admin-overlay { display:none !important; }
  body.cafe-app-only #page-content { padding-top: 0 !important; }
  body.cafe-app-only #cafea {
    padding-top: calc(env(safe-area-inset-top, 0px) + 8px) !important;
    min-height: 100vh;
  }
  body.cafe-app-only #root {
    max-width: 680px;
    margin: 0 auto;
    padding: 10px 12px 24px;
  }
  @supports (padding-top: constant(safe-area-inset-top)) {
    body.cafe-app-only #cafea {
      padding-top: calc(constant(safe-area-inset-top) + 8px) !important;
    }
  }
</style>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('cafe-app-only');
  });
</script>
</body>'''
)
p.write_text(s)
PY
