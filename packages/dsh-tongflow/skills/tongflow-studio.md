---
name: tongflow-studio
description: How to work in a TongFlow studio project — the film-crew project layout, ids and tf:// references, the bible / breakdown / takes discipline, and the rule that all image, audio and video generation goes through a saved TongFlow workflow file.
whenToUse: Whenever the user is producing media in a studio project (characters, storyboards, shots, dubbing, video, cuts) or asks how the studio, its folders, takes or workflows work.
---

# TongFlow studio — how the crew works

You are the director's assistant on a real production. Three layers, never mixed up:

1. **You (the agent)** create: story, script, characters, shot lists, prompts, decisions, QC notes. You write those as plain files with the ordinary file tools.
2. **TongFlow** generates deterministically: every image, voice, music, video or cut is produced by **running a saved workflow file** (`workflows/*.tongflow.json`). There is no "just generate an image" tool — and that is the point: a workflow file is reproducible, editable on the canvas by the user, and re-runnable with new inputs.
3. **The project folder** is the single source of truth. Nothing lives only in chat.

## Project layout

```
project.json                  manifest (title, template, episodes)
01_DEV/                       treatment.md · outline.md · script.md        ← you write these
02_PREPRO/bible/<ID>/         card.md · consistency.json · REF/ · VO/       ← one folder per entity
02_PREPRO/breakdown/EP01/     scenes.json                                   ← shot breakdown (tongflow_breakdown_set)
02_PREPRO/inbox/              files the user dropped in
03_PROD/shots/<SHOT>/         SB/ KF/ ANI/ DLG/                             ← takes per pass
04_POST/EP01/                 MUS/ SFX/ MIX/ CUT/
05_DELIVERY/
workflows/                    *.tongflow.json                               ← agent-authored workflows
dailies/                      review notes (tongflow_dailies_note)
```

## Ids (fixed grammar — never improvise)

- Episode `EP01` · scene `EP01_SC003` · shot `EP01_SC003_SH0010` (shots step by 10; `SH0015` can be inserted later).
- Entities: `CHR_MEI` (character) · `LOC_ROOFTOP` (location) · `PRP_UMBRELLA` (prop) · `STY_MAIN` (style). UPPER_SNAKE after the prefix.
- Passes: entity `REF` (reference image) `VO` (voice reference) · shot `SB` (storyboard) `KF` (keyframe) `ANI` (animation) `DLG` (dialogue audio) · episode `MUS` `SFX` `MIX` `CUT`.
- Takes: `T01, T02, …` — a run never overwrites; it adds the next take. One take per pass is **circled** (the one references resolve to). Circle deliberately with `tongflow_take_circle` after reviewing.

## tf:// references — how workflows point at assets by role

```
tf://CHR_MEI/REF                circled reference image of Mei
tf://CHR_MEI/REF/T02            a specific take        tf://CHR_MEI/REF/*   all REF takes
tf://CHR_MEI/VO                 circled voice reference
tf://CHR_MEI/prompt             promptPrefix from the consistency kit   tf://CHR_MEI/negative
tf://STY_MAIN/prompt            the show's style prefix
tf://EP01_SC003_SH0010/KF       circled keyframe of a shot
tf://EP01_SC003_SH0010/dialogue         all lines of the shot (texts)   …/dialogue/2 = second line
tf://EP01_SC003_SH0010/prompt/KF        the KF prompt stored in the breakdown
tf://EP01/ANI                   circled ANI of every shot in EP01, in order (for the cut)
tf://file/01_DEV/script.md      any project file
```

Use tf:// refs in `tongflow_workflow_bind` bindings and inside data nodes (`data:{fileKeys:['tf://CHR_MEI/REF']}`) so a workflow keeps working when the circled take changes.

**Composing prompts:** put `{{tf://…}}` placeholders inside ONE text — they are expanded at run time:

```
textNode data.texts: ["{{tf://STY_MAIN/prompt}}, {{tf://CHR_MEI/prompt}}, full-body character reference sheet, front and side view, neutral pose, plain background"]
```

That is the standard shape for every image / video prompt: style prefix, entity prefix(es), then the shot-specific text. Do not build text-combining node chains for this, and do not bind refs to input names that do not exist — a workflow only has inputs when a level-0 data node has NO data.

## The consistency kit (why shots match)

Every entity's `consistency.json` holds `promptPrefix`, `promptSuffix`, `negativePrompt`, `seed`, `pluginId`, `model`. Fill it when you create the entity (`tongflow_bible_upsert`) and **always** feed it into workflows that render the entity: bind character `REF` images as image inputs and compose prompts as `<STY_MAIN prefix>, <CHR prefix>, <shot-specific text>`. Never re-describe a character from memory when a REF exists.

## The loop for any media

1. `tongflow_project_status` — see what exists; `tongflow_node_catalog` — see node types and installed plugins.
2. `tongflow_workflow_new({ path: '<OWNER>_<PASS>', fromTemplate })` — one file per asset → `tongflow_workflow_patch` (write the concrete prompt / refs / params into the nodes) → `tongflow_workflow_read` (verify wires + validation).
3. `tongflow_workflow_bind` only for inputs you deliberately left open; the target is implied by the file name.
4. `tongflow_workflow_run` — foreground for a single image, `run_in_background` for video/batches; keep working meanwhile.
5. Review: `tongflow_look` (images / video contact sheets) and `tongflow_perceive` (video/audio understanding, transcripts). Write findings with `tongflow_dailies_note`.
6. Circle the good take (`tongflow_take_circle`) or fix the workflow / prompt and run again (next take).

Rules of thumb:
- Patch incrementally; never rebuild a workflow from scratch; never invent node ids. Read the patch result: `ok:false` steps must be fixed before running.
- Two ways to parameterize: (a) a level-0 data node WITHOUT data becomes an input you bind per run (`tongflow_workflow_bind` / `tongflow_workflow_run inputs`) — name it with `data:{inputName:"prompt"}`; (b) put `tf://` refs or `{{tf://…}}` templates directly in node data. Both resolve at run time against the circled takes.
- Templates live under `workflows/templates/` (character-sheet, location-plate, storyboard-panel, shot-keyframe, dub-line, voice-preset, shot-i2v, episode-music, assemble-episode). They are starting shapes only: copy one per asset with `tongflow_workflow_new({ path: '<OWNER>_<PASS>', fromTemplate: '<template>' })`, then patch its nodes with the concrete text and refs (a template's inputs may stay as inputs bound in `meta.bindings`, but prefer writing values into the nodes).
- Text you author (script, dialogue, prompts) goes into files / the breakdown, then into workflows **as inputs** — text generation nodes are only for mechanical bulk transforms.
- **One workflow file per generated asset.** Every image / audio / video gets its *own* `.tongflow.json`, named after its target: `CHR_MEI_REF`, `LOC_ROOFTOP_REF`, `EP01_SC001_SH0010_SB|KF|ANI|DLG`, `EP01_MUS`, `EP01_CUT` (add a suffix for variants: `EP01_SC001_SH0010_KF_wide`). Start from a template (`tongflow_workflow_new({ path: 'EP01_SC001_SH0010_KF', fromTemplate: 'shot-keyframe' })`), then **patch the concrete prompt / `tf://` refs / params into the nodes** so the file is self-contained: opening it on the canvas shows exactly what made that take, and re-running it reproduces it. Do not keep shared parameterized workflows that you re-bind per shot. A file named `<OWNER>_<PASS>` needs no explicit target — it is inferred.
- The take's provenance points at its workflow; when a take is off, fix *that* workflow (or the bible / breakdown it draws from) and run it again — the next take lands beside the old one.
- Before running, make sure the plugin for each node is installed (`tongflow_plugins_list`, `tongflow_plugins_install`) and its API keys are configured in the tongflow settings.
- If the user edited a workflow on the canvas, `tongflow_workflow_read` it again before patching.
