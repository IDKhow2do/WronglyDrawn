# Boon card art + Arsenal redesign (2026-11-09)

## Boon card art
- 15 card illustrations, one per boon in `BOONS` (`src/meta/Arsenal.ts`): `public/assets/boons/<id>.webp` (512², q82). `boon-art-sheet.png` shows them all.
- Made with Codex `codex exec` image generation, using the same refs as the stickers (title painting + `reference/ref-1.webp`).
  Pipeline: `reference/tools_boons/` (`common.txt` style, `bg_<rarity>.txt`, `p_<id>.txt` = `rarity|subject`, `run.sh <id>`, `towebp.mjs`).
- Rarity is in the art too: common = turquoise plaster, rare = cobalt, epic = violet, legendary = orange-gold with rays.
- Used on the pick-1-of-3 cards (`showBoons`) and as wheat-pasted posters on the Arsenal wall. `boonImg()` + `wireArtFallback()` in
  `src/ui/ItemArt.ts` fall back to the SVG sticker if a file is missing.

## Arsenal: "WAI's wall"
- Top: a tagged brick wall (`textures/plaster_blue.webp`) with sprayed stencil spots — spray cap (1), gadget (1), charms (3) — and this run's boons as mini posters.
- Below: a sticker sheet with every item. Tap a sticker to **slap** it on the wall; tap it on the wall (or its empty die-cut on the sheet) to **peel** it off.
  Charms keep their wall spot when a neighbour is peeled. A full charm row shakes (plus the existing toast). Locked stickers sit under black tape; tapping one shows the unlock hint.
- A masking-tape strip shows the details of the hovered/focused/tapped sticker or boon (works on touch, no hover needed).
- Screenshots: `arsenal-*.png`, `boons-*.png` (desktop 1440×900, phone 390×844, phone landscape 844×390, zh, zh-phone);
  `arsenal-desktop-peeling/slapping/locked-info.png` show the interactions.
- Harness: `node reference/tools_boons/shots.mjs [all|en|phone|land|zh|zhphone]` (headless Chrome, `--mute-audio`, port 9340, own profile, killed at the end).
