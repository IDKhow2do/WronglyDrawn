# Boss music: moods, fallback, shortlist, how to add a track

> [PROTOCOL]: Update this doc when src/audio/Music.ts (boss moods) or src/level/BossMood.ts changes, then check their headers.

## How it works now (code)

| Mood | Who reports it | Plays |
|---|---|---|
| `boss` | Every session, while a creature with base paint ≥ `BOSS_HP` (1000) is engaged and awake within 32 m of WAI (`bossMood()` in `src/level/BossMood.ts`). Level 1: Red Inkwell, Eraser. Level 2: Red Gramophone, the Hush. | `boss.mp3`, else a **stand-in**: `combat.mp3` |
| `boss_final` | `WorksSession`, while `SoulsFight.mode` is `intro` or `on` (from the ink gate's intro to the win). The SMUDGED beat (`down`) drops it. | `boss_final.mp3`, else `boss.mp3`, else `combat.mp3` |

- The fight's own rules start and end the mood: the alert or wake intro (or `engage()` + `bossIntro`) starts it. A repaint (STUNNED), WAI leaving the square (mid-bosses drop their alert), or a respawn far away (sessions calm chasers) ends it. Phase roars and grace beats keep `engaged`, so the music holds through them.
- Priority in each session: `completed → victory`, then boss, then `victoryT → victory`, then `combat / danger / explore`. A boss win sets `victoryT` (Eraser, Hush, Red Pen), so the next mood is `victory`. A mid-boss win returns to the level loop.
- **Stand-in treatment** (when the mood has no file of its own): the loop plays at 0.9× (about 140 bpm, 1.8 semitones lower). It plays under a low-pass that sweeps from 220 Hz to its base cutoff over 3.5 s as the boss arrives (base 1400 Hz for `boss`, 900 Hz for `boss_final`). The cutoff opens 2.6 octaves with the fight's **heat** (1 − hp/maxHp, set every frame from `main.ts` through `Music.setHeat`). A synth overlay plays on top on its own bus: a low noise rumble, a slow heavy thud on beats 1 and 3, and an exam-clock tick on every beat. The overlay is locked to the loop's beat grid (`LOOP_BEATS`: combat.mp3 = 64 beats). The tick comes in at heat ≥ 0.33 (from the start in the final). The thud plays every beat from heat ≥ 0.66. In the final, the tick runs in eighths from heat ≥ 0.66.
- A real `boss.mp3` / `boss_final.mp3` plays clean: full rate, no filter, no overlay. When `boss_final` falls back to `boss.mp3`, it still gets the filter and the rumble. It gets the rhythmic overlay only if `LOOP_BEATS.boss` is set.
- **Missing files:** `Music.ts` fetches only the names listed in `public/audio/music/tracks.json`. An absent boss file costs no request and makes no console 404. If `tracks.json` itself fails to load, the five shipped loops are fetched.
- Test hook: `__WD.app.audio.music.mood` and `.track` (`'combat@boss'` = the stand-in, `'synth'` = no loop).

## Shortlist (pages read 2026-11-14; nothing downloaded)

Every candidate below is marked **CC0** on its OpenGameArt page. File sizes are as shown on the page. Most pages do not state a length or bitrate. For those, the length is "not stated" and must be read from the file after download.

### `boss` (Inkwell, Eraser, Gramophone, Hush): marching, ticking, "the exam is ending"

| Rank | Title | Author | Page | File (format, size) | Length | Licence (as stated) | Loops? | Why |
|---|---|---|---|---|---|---|---|---|
| **1 (pick)** | Raiders March | Bobjt | https://opengameart.org/content/raiders-march | `raiders_march_-_loop.ogg` (OGG, 2.5 Mb); also `raiders_march_-_loop.mp3` 1.3 Mb and `_-_with_tail` versions | not stated | "License(s): CC0" | Yes: a dedicated loop version | A hectic, sinister march in a classical + synth hybrid (tags: marching, imminent, boss). It is the closest to "the teacher marches in". The orc/ghoul tags lean darker than the doodle look, so check on a listen that it is not too grim. |
| 2 | Urban Boss Battle | MintoDog | https://opengameart.org/content/urban-boss-battle | `urban_boss_battle_bpm135.ogg` (OGG, 3.8 Mb); `.mp3` 5.1 Mb | not stated | "License(s): CC0" | "This music is loopable." | Sax + brass, tagged intense, fun, joy, upbeat, at 135 bpm. It brings pressure with a cartoon grin, a good fit for a playful game. |
| 3 | MIDI battle theme | tapatilorenzo | https://opengameart.org/content/midi-battle-theme | `battle_11.mp3` (MP3, 1.5 Mb) | 1:04 (stated) | "License(s): CC0" | "Loops." | A short, driving BeepBox piece written for a boss fight. Its retro timbre clashes least with the synth overlay. The BeepBox source link is on the page. |
| 4 | Children's March Theme | CleytonKauffman | https://opengameart.org/content/childrens-march-theme | `childrens_march_theme.zip` (WAV + MP3 + OGG, 15.4 Mb) | 1:04 (stated) | "License(s): CC0" | "Loops seamlessly: Yes" (the author warns that the MP3 has a loop gap: use the WAV/OGG) | A playful trombone + snare march. It is too cheerful on its own; slowed with the overlay it becomes a schoolroom march. Use it as the safe choice if 1–3 feel too dark. |

### `boss_final` (THE RED PEN, level 3 roof, souls-like duel): bigger, dramatic

| Rank | Title | Author | Page | File (format, size) | Length | Licence (as stated) | Loops? | Why |
|---|---|---|---|---|---|---|---|---|
| **1 (pick)** | Epic Boss Battle (page title "Boss Battle Music") | SubspaceAudio (Juhani Junkala) | https://opengameart.org/content/boss-battle-music | `Juhani Junkala - Epic Boss Battle [Seamlessly Looping].wav` (WAV, 21.8 Mb) | not stated (≈2 min if 16-bit 44.1 kHz stereo; estimate) | "License(s): CC0" | "Loops seamlessly!" | An orchestral "God of War"-style piece with weight and drama that can carry a long duel. It is by the same composer as the explore loops, so it sits naturally in the soundtrack. A commenter used it on a final boss. |
| 2 | Boss Battle Theme ("Battle RPG Theme") | CleytonKauffman | https://opengameart.org/content/boss-battle-theme | `CleytonRX - Battle RPG Theme.mp3` (MP3, 6.9 Mb); `… Var.ogg` (OGG, 4.6 Mb, a variation) | not stated | "License(s): CC0" | "Looped: Yes." | JRPG orchestra + rock drums (tags: final, epic, boss). It is more heroic than menacing and still playful. |
| 3 | Battle Theme | Wolfgang_ | https://opengameart.org/content/battle-theme-0 | `Battle.mp3` (MP3, 4.6 Mb) | not stated | "License(s): CC0" | Not stated: needs a loop cut | Orchestral tension (tags: tension, orchestral) and widely used (2.6k downloads). A cut loop point is extra work. |
| 4 | Trance Boss Battle | MintoDog | https://opengameart.org/content/trance-boss-battle | `trance_boss_battle_bpm150.ogg` (OGG, 3.5 Mb); `.mp3` 4.1 Mb | not stated | "License(s): CC0" | "This music is loopable." | Synth/EDM at 150 bpm, tagged uplifting. It is a fallback only: it is energetic but has less of the "giant teacher" weight. |

Considered and left out: *Hard / Heavy Boss Battle 1–2* (MintoDog, CC0) are hardcore synth or metal and too grim and too fast (200–210 bpm). *Boss Fight Bounce* (Locomule) is dual-licensed "GPL 3.0 CC0"; it is usable as CC0, but I left it out to keep the licence picture clean. *Mid-Boss Battle* (Jarewills, CC0) is described by its author as a "raw/unfinished … prototype". *BOSS-ⅰ* (ウラン235) returned "Access denied" when read and was not checked. CC-BY / CC-BY-SA tracks (Matthew Pablo's *Colossal Boss Battle Theme*, Patrick Maney's *Symphony of Chaos*, tcarisland's *Boss Battle*) are excluded by the brief.

## Steps to add an approved track

ffmpeg is installed on this Mac (`<local-path>`, version 9.0.2, with the `loudnorm` filter).

1. **Download** the approved file from its page (the link in the table) into a new, empty folder, e.g. `/tmp/boss-src/`.
2. **Loudness-normalise to −19 LUFS and encode 128 kbps MP3** (two-pass loudnorm, the same target as the other loops):
   ```sh
   SRC="/tmp/boss-src/<file>"            # .wav / .ogg / .mp3 as downloaded
   OUT=public/audio/music/boss.mp3       # or boss_final.mp3
   # pass 1: measure
   ffmpeg -hide_banner -i "$SRC" -af loudnorm=I=-19:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | tail -12
   # pass 2: apply with the measured values (input_i, input_tp, input_lra, input_thresh, target_offset)
   ffmpeg -hide_banner -y -i "$SRC" -af "loudnorm=I=-19:TP=-1.5:LRA=11:measured_I=<input_i>:measured_TP=<input_tp>:measured_LRA=<input_lra>:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true" -ar 44100 -c:a libmp3lame -b:a 128k "$OUT"
   # check: about −19 LUFS
   ffmpeg -hide_banner -i "$OUT" -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness" | tail -2
   ```
   If the track is not a clean loop (Battle Theme), cut it to whole bars before encoding (`-ss <start> -t <length>`).
3. **Name it** `boss.mp3` (ordinary bosses) or `boss_final.mp3` (the Red Pen) in `public/audio/music/`.
4. **List it** in `public/audio/music/tracks.json` (`"loops": [..., "boss"]`). Unlisted files are never fetched.
5. **Credit it**: add a row to `public/audio/music/CREDITS.md`, e.g.
   `| boss.mp3 | Raiders March (loop) | Bobjt | https://opengameart.org/content/raiders-march |`
6. Optional: if `boss.mp3` will also stand in for `boss_final`, add its beat count per pass to `LOOP_BEATS` in `src/audio/Music.ts`. The final's thud and tick then lock to it. Without the count, only the rumble plays on top.
7. Check: start a boss fight and read `__WD.app.audio.music.track`. It should now say `boss`, not `combat@boss`.
