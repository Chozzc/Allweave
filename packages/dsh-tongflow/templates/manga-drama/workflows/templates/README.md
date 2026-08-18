# Workflow templates

Copy one with `tongflow_workflow_new({ path, fromTemplate: '<name>' (resolved under workflows/templates/) })`, then bind its inputs (`tongflow_workflow_bind`) and run. Plugins are filled with the installed default for each slot when copied.

- `character-sheet` — Text → reference image (REF) for a bible entity.
- `location-plate` — Text → establishing plate (REF) for a location.
- `storyboard-panel` — Prompt input → storyboard panel (SB). Bind `prompt` per shot. Inputs: prompt.
- `shot-keyframe` — Reference images + prompt → keyframe (KF) via image fusion. Bind `refs` and `prompt` per shot. Inputs: refs, prompt.
- `dub-line` — Voice reference + line → dialogue audio (DLG). Bind `voice` and `text` per line. Inputs: voice, text.
- `voice-preset` — Line → speech with a preset voice (VO reference or DLG when no clone plugin). Inputs: text.
- `shot-i2v` — Keyframe + motion prompt → animation (ANI). Bind `image` and `prompt` per shot. Inputs: image, prompt.
- `episode-music` — Mood prompt → music track (MUS). Inputs: prompt.
- `assemble-episode` — Concatenate the circled ANI takes of an episode into a cut (CUT). Bind `clips` ← tf://EP01/ANI. Inputs: clips.
