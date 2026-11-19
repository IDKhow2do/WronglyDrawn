# Round 3: the setup screen, SKIP, the author's credit, the letter

> L3 notes | Parent: docs/story/NOTES.md
> [PROTOCOL]: Update this file on change, then check docs/story/NOTES.md

Date 2026-11-14. Test ports: Vite 5294 (no HMR, /tmp/wd-r3/vite.mjs), headless Chrome CDP 9394 (/tmp/wd-r3/chrome-en, muted).

## What was built

1. **One setup screen before the game** — `src/ui/SetupScreen.ts` + `src/ui/setup.css`.
   Three taped sheets: picture quality (Auto / Low / Medium / High; Auto shows what it detected), colours
   (the LOOK presets + "More colours" which opens the existing LOOK panel), pen (the three difficulty cards).
   Then LET'S DRAW. Every pick writes the same store the pause menu writes (Quality, Look, Difficulty), so it is
   remembered, preselected next time and still changeable in the pause menu / LOOK panel.
   - Shown **once per device**: the `wd.setup` flag. A returning player presses START and goes straight in.
   - Never shown under `?test` or `?difficulty=` (setupDue()): the bots keep `.start-btn` click → PLAYING.
   - Level select (LEVELS) goes through the same gate, so the first-ever run is asked once whichever button it uses.
   - Mouse, touch, keyboard (arrows + Enter, Esc = back) and gamepad (d-pad / stick, A picks, Start goes, B backs out).
   - The old `firstRunDifficulty` / `askDifficulty` are gone; `difficultyCards()` (DifficultyPicker) renders the cards
     from DIFFICULTY_TEXT, so the next difficulty pass changes the words with no edit here.
2. **SKIP on every story sequence** — `HoldToSkip` in `src/story/StoryBook.ts` is now a visible taped SKIP button
   (click / tap), plus Esc and the pad's B / Start, plus the old hold (Space / Enter / mouse / finger, 1 s).
   - It cannot fire on the first frame: `SKIP_ARM_SEC = 0.8` (the button is `.arming`, pointer-events none; the
     key / pad paths test `armed`), and a button held over from the screen before never counts (PadReader seeds itself).
   - A book opening now exits pointer lock (otherwise every click went to the locked canvas); so does a level outro.
   - The level title card gets a SKIP too (`anywhere: false`: no hold, gameplay keys stay free). It ends the camera
     push-in through `finishIntro()` — exactly the state the push-in would have ended in. Under pointer lock the card's
     button is not clickable; a click anywhere already ends the push-in (main.ts canvas mousedown), and the pad works.
3. **Author** — `AUTHOR = '巴特歪'` in `src/story/EndPages.ts` is the one place the name is written:
   `LETTER_SIGNATURE`, the END credits and the title's corner credit (`.st-credit`, mounted by StoryFlow) all read it.
   All three glyphs are GB2312 level 1, so the shipped WD Hand subset already carries them.
4. **The letter** rewritten for a child (below, and in docs/story/NOTES.md). Four other lines retuned for the same
   reader: "It was the answer key" → "It came with the right answers"; "measured everything against one standard" →
   "with the same ruler"; the WAI naming aside; the margin slip "See rubric" → "See the rules".

## Proof (docs/story/shots/round3/)
- setup-en.jpg, setup-zh.jpg (1280×720), setup-en-portrait.jpg + -bottom.jpg (390×844), setup-zh-landscape.jpg (844×390).
- flow-en-1-title → 2-setup → 3-intro → 4-card → 5-playing (click-through: TITLE → setup → book → SKIP → INTRO card
  → PLAYING; `wd.setup` = 1 and `wd.story` = {"intro":1} written exactly as a watched book writes them), flow-zh-4-card.
- bot-test-playing.jpg: `?test&level=plaza&difficulty=gentle`, `.start-btn` click → PLAYING, no setup screen, no book.
- end-letter-en/zh.jpg, end-credits-en/zh.jpg, title-credit-en.jpg.
- `npx tsc --noEmit -p .` clean.

## Not done / not verified
- The level outro's SKIP button was not clicked in a real run (it needs a finished level); its code path is the same
  HoldToSkip → finish() the hold already used, and the cursor is now freed when an outro starts.
- No gamepad hardware here: the pad paths are code only (PadReader, standard mapping).
