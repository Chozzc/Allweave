# Naming & references

Single source of truth: [`src/project/naming.ts`](../src/project/naming.ts), [`src/project/refs.ts`](../src/project/refs.ts).

## Ids

| thing | form | example |
|---|---|---|
| episode | `EP` + 2 digits | `EP01` |
| scene | `<EP>_SC` + 3 digits | `EP01_SC003` |
| shot | `<SC>_SH` + 4 digits, step 10 | `EP01_SC003_SH0010` (insert `SH0015` later) |
| entity | `CHR_` / `LOC_` / `PRP_` / `STY_` + UPPER_SNAKE | `CHR_MEI`, `LOC_ROOFTOP`, `PRP_UMBRELLA`, `STY_MAIN` |
| take | `T` + 2 digits | `T01` … `T99` |
| project | kebab-case | `rooftop-rain` |

## Passes (departments)

| owner | passes |
|---|---|
| entity | `REF` reference image · `VO` voice reference |
| shot | `SB` storyboard · `KF` keyframe · `ANI` animation · `DLG` dialogue audio |
| episode | `MUS` music · `SFX` · `MIX` · `CUT` |

Files: `<owner>_<PASS>_<take>.<ext>` + `<owner>_<PASS>_<take>.provenance.json`, under `<ownerDir>/<PASS>/`.
Owner dirs: entity → `world/<ID>`, shot → `shots/<SHOT>`, episode → `episodes/<EP>`.
`takes.json` in the owner dir records `circled: { PASS: "T02" }`.

## `tf://` references

```
tf://<ENTITY>/REF | /VO             circled take (add /T02 for a take, /* for all)
tf://<ENTITY>/card | /prompt | /suffix | /negative
tf://<SHOT>/SB | /KF | /ANI | /DLG
tf://<SHOT>/dialogue[/n] | /prompt/<SB|KF|ANI> | /action
tf://<EP>/MUS | /SFX | /MIX | /CUT
tf://<EP or SCENE>/<SB|KF|ANI|DLG>   circled take of every shot, in shooting order
tf://file/<key>                      any project file    tf://text/<key>  its text
```

Inside strings, `{{tf://…}}` placeholders are expanded at run time (text refs joined by a space).

## Workflow files

`workflows/<name>.tongflow.json` = `{ name, description?, flow:{nodes,edges}, executable?, exportError?, meta:{ bindings?, target?, template?, purpose? } }`.
Level-0 data nodes without data are inputs; name them with `data.inputName`. Bindings map input names to `tf://` refs / project keys / text.
