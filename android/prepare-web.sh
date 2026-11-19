#!/usr/bin/env bash
# [INPUT]: 已安装的网页依赖、玩法提交和发布标识。
# [OUTPUT]: assets/game/ 中可离线运行的网页与构建来源。
# [POS]: 将同一批玩法送入 Android，拒绝混入未记录的网页改动。
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
gameplay_commit="${WRONGDRAW_GAMEPLAY_COMMIT:?请提供完整玩法提交}"
: "${VITE_RELEASE_ID:?请提供 Android 发布标识}"
web_output="$repo_root/android/.web-build"
web_assets="$repo_root/android/app/src/main/assets/game"

cd "$repo_root"
git rev-parse --verify "$gameplay_commit^{commit}" >/dev/null
git diff --exit-code "$gameplay_commit" -- src public index.html package.json package-lock.json vite.config.ts
trap 'rm -rf "$web_output"' EXIT
npm run build -- --outDir "$web_output"
rm -rf "$web_assets"
mkdir -p "$web_assets"
cp -R "$web_output/." "$web_assets/"
WRONGDRAW_SOURCE_COMMIT="$(git rev-parse HEAD)" node --input-type=module - "$web_assets" <<'JS'
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.argv[2], 'android-build.json'), JSON.stringify({
  releaseId: process.env.VITE_RELEASE_ID,
  gameplayCommit: process.env.WRONGDRAW_GAMEPLAY_COMMIT,
  sourceCommit: process.env.WRONGDRAW_SOURCE_COMMIT,
}, null, 2) + '\n');
JS
