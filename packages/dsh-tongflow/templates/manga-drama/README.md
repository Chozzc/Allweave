# {{title}}

Manga-drama production, run like a film crew. This folder is the single source
of truth: the agent writes text here, TongFlow workflows generate media into
numbered takes, and you circle the takes you like.

```
project.json                 project manifest
01_DEV/                      development: treatment, outline, script (plain text — written by the agent)
02_PREPRO/bible/<ID>/        bible: CHR_ characters, LOC_ locations, PRP_ props, STY_ style
                              card.md · consistency.json · REF/ (reference images) · VO/ (voice reference)
02_PREPRO/breakdown/EP01/    scenes.json — the shot breakdown (scenes → shots, dialogue, prompts)
02_PREPRO/inbox/             files you drop in for the crew (uploads)
03_PROD/shots/<SHOT>/        SB/ storyboard · KF/ keyframe · ANI/ animation · DLG/ dialogue audio
04_POST/EP01/                MUS/ SFX/ MIX/ CUT/ — episode-level post
05_DELIVERY/                 finished deliverables
workflows/                   *.tongflow.json — agent-authored TongFlow workflows (open on the canvas)
dailies/                     review notes and the agent's own QC reports
```

Ids: `EP01` · `EP01_SC003` · `EP01_SC003_SH0010` · `CHR_MEI` · takes `T01…`.
References: `tf://CHR_MEI/REF`, `tf://EP01_SC003_SH0010/KF`, `tf://EP01/ANI`, `tf://EP01_SC003_SH0010/dialogue`.

{{logline}}
