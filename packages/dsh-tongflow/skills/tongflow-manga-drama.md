---
name: tongflow-manga-drama
description: Production method for a manga-drama (anime-style serialized short drama) in a TongFlow studio project — script → bible → shot breakdown → storyboards → keyframes → dubbing → image-to-video → assembly, with the acceptance checks for each stage.
whenToUse: When the project template is manga-drama, or the user wants to make an anime / manga style episode, short drama, or animated series.
---

# Manga drama — the pipeline

Work stage by stage. Each stage has an artifact, a tool, and an acceptance check. Do not start a downstream stage before its upstream inputs are circled.

## 0. Setup

- `tongflow_project_status`. If empty: confirm title, tone, target length (a manga-drama episode is 60–180 s, 8–25 shots), aspect ratio (9:16 vertical is common; 16:9 for widescreen), language of dialogue.
- `tongflow_plugins_list`; make sure at least one plugin is installed for `image-gen` / `image-edit`, `text-gen-speech-*` (or voice clone), `image-gen-video`, and a video/audio describe slot for QC. Ask the user for API keys when a plugin needs them.
- Read `02_PREPRO/bible/STY_MAIN/card.md` and `consistency.json`; refine the style prefix with the user (medium, line, palette, lighting, camera grammar). Everything visual inherits `tf://STY_MAIN/prompt`.

## 1. Development (text — you write it)

- `01_DEV/treatment.md`: premise, characters, arc, tone. `01_DEV/outline.md`: episode beats. `01_DEV/script.md`: the screenplay (scene headings, action, dialogue). Plain markdown via file tools.
- Acceptance: the user approves the script (or you were told to proceed autonomously).

## 2. Bible (entities + consistency kit)

For every character, key location, hero prop:
- `tongflow_bible_upsert` with a full `card.md` (name, age, silhouette, face, hair, wardrobe, palette, personality, voice description) and `consistency` = `{ promptPrefix: "<style-agnostic visual description, comma separated>", negativePrompt, seed }`.
- Generate the **reference sheet** into `REF`: `tongflow_workflow_new({ path: 'CHR_X_REF', fromTemplate: 'character-sheet' })`, then patch its text node to `["{{tf://STY_MAIN/prompt}}, {{tf://CHR_X/prompt}}, full-body character reference sheet, front and side view, neutral pose, plain background"]`. Run → `tongflow_look` → circle the best. Do 2–3 takes if the first is off-model. Same for locations: `LOC_Y_REF` from `location-plate`.
- Voice: choose a preset voice or make a `VO` reference clip with a text-to-speech workflow (a neutral sentence in the character's voice). Circle it; dubbing binds `tf://CHR_X/VO`.
- Acceptance: every speaking character has a circled REF and VO; STY_MAIN prefix final.

## 3. Shot breakdown (text → structured)

- `tongflow_breakdown_set` for `EP01`: scenes with `location`, `timeOfDay`, `characters`; shots with `size` (WS/MS/CU/…), `camera`, `duration` (3–6 s per shot for i2v), `characters`, `props`, `action`, `dialogue` `[ {character, line, direction} ]`, and `prompts.KF` — the **shot-specific** description (composition, pose, expression, lighting); the style and character prefixes are added by the workflow, not repeated here. Add `prompts.ANI` = the motion description (what moves, camera move) for image-to-video.
- Acceptance: every shot has KF and ANI prompts, and each dialogue line names a character that exists in the bible.

## 4. Storyboards (SB) — optional but fast

- Per shot: `<SHOT>_SB` from `storyboard-panel` (text → image, cheap plugin, low res) with the text node set to `"{{tf://STY_MAIN/prompt}}, storyboard sketch, {{tf://<SHOT>/prompt/KF}}"`. Run all (background), review with `tongflow_look` as a set. Fix compositions in the breakdown, not by hand-editing images.

## 5. Keyframes (KF)

- Per shot: `<SHOT>_KF` from `shot-keyframe`; patch the image node to `fileKeys: ['tf://CHR_X/REF', 'tf://LOC_Y/REF']` (every character in the shot, plus the plate if one exists) and the text node to `"{{tf://STY_MAIN/prompt}}, {{tf://CHR_X/prompt}}, {{tf://<SHOT>/prompt/KF}}"`; aspect ratio from the project. Run in background, batch by scene.
- QC each KF with `tongflow_look`: on-model face/hair/wardrobe vs REF, correct shot size, no text/watermark, hands. Note issues in dailies; re-run with an adjusted `prompts.KF` for bad ones; circle the good ones.
- Acceptance: every shot has a circled KF.

## 6. Dubbing (DLG)

- Per line: `<SHOT>_DLG` (or `<SHOT>_DLG_2` for a second line) from `dub-line` (clone with `tf://CHR_X/VO`) or `voice-preset`; patch the text node to `"{{tf://<SHOT>/dialogue/<n>}}"` and the audio node to `tf://CHR_X/VO`. QC with `tongflow_perceive` (transcribe) — the transcript must match the line; check emotion via `direction`.
- Acceptance: every dialogue line has an audio take; shots without dialogue skip this pass.

## 7. Animation (ANI)

- Per shot: `<SHOT>_ANI` from `shot-i2v`; patch the image node to `tf://<SHOT>/KF`, the text node to `"{{tf://<SHOT>/prompt/ANI}}"` (motion only), `duration` from the breakdown; optionally an audio node `tf://<SHOT>/DLG` for lip-sync plugins. Always `run_in_background`; run several shots in parallel if the concurrency limit allows.
- QC: `tongflow_look` (contact sheet — check for morphing, extra limbs, identity drift, wrong motion) then `tongflow_perceive` for a second opinion on motion/continuity. Re-run with a tighter ANI prompt or a different KF take when needed. Circle.
- Acceptance: every shot has a circled ANI.

## 8. Music, mix, cut

- `EP01_MUS` from `episode-music` with a mood prompt in its text node.
- `EP01_CUT` from `assemble-episode` (concat / video-edit nodes): video node `tf://EP01/ANI` (already in shooting order), plus `tf://EP01/DLG` / `tf://EP01/MUS` where the plugin takes them. Review with `tongflow_look` + `tongflow_perceive`; write the dailies note; circle. Copy the final into `05_DELIVERY/` when the user signs off.

## Working style

- Batch smartly: create the per-shot workflows for a whole scene, run them `run_in_background`, then review as a set.
- Every review produces a `tongflow_dailies_note` — what passed, what to redo, why.
- When something is consistently off-model, fix the **source** (consistency kit, REF take, breakdown prompt) — not individual images.
- Keep the user in the loop at stage boundaries (script, bible, breakdown, first KFs, first ANI): show what you have and ask before spending on video generation.
