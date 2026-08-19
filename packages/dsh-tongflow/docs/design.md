# Design

## Layers

```
dsh (harness) ── tools / jobs / skills / webServer / attachments
      │
      ▼
dsh-tongflow host (Node)                       dsh-tongflow client (browser)
  Studio ─ config, paths, python venv            Studio overlay (sidebar 🎬)
  StudioApi ─ projects, bible, breakdown,          tree · preview · inspector
              takes, workflows, runs, plugins      CanvasPane = tongflow/canvas
  tools/ ─ tongflow_* (defineTool)                 talks to /tongflow/p/:pid/api/*
  http/ ─ /tongflow/* (JSON, SSE, Range)
  engine/ ─ python -m tongflow engine (NDJSON) → ingest → takes + provenance
      │
      ▼
TongFlow SDK (PyPI) + plugins (~/.dsh/tongflow/plugins), each in the engine's shared venv
```

## Invariants

- The project directory is the source of truth. Tools hydrate a headless `createFlowStore` from the file, apply a change, re-export, write back. The canvas loads and saves the same file (autosave ticker). No session-level canvas state.
- Media generation = run a workflow file. Canvas "run node" is wrapped into a one-node inline workflow (`engine/single-node.ts`) so it goes through the same engine and file layout.
- Every run's outputs become numbered takes with provenance; nothing is overwritten. The first take of a pass is circled automatically; later ones are circled deliberately.
- `tf://` refs (and `{{tf://…}}` templates) are resolved at run time against circled takes; workflows keep working when a take is re-circled.
- Registrations are Cordis effects; the plugin unloads cleanly.

## Run pipeline

`StudioApi.startRun` → `RunManager.start` (queue, concurrency) → `executeRun`: bind inputs (tf:// → paths / texts), resolve embedded refs, spawn `python -m tongflow engine` with `inline_outputs:false`, `out_dir=<project>/.runs/<runId>`, `file_key_base=<project>`; NDJSON events → `RunEvent`s (SSE for the UI, `readOutput` for dsh jobs, canvas frames for the compat API) → `ingestOutputs` → `addTake` (+ `provenance.json`).

## Client bundle

CJS closure factory (`window.__ModuleLoader__.load({id, factory})`), one file, platform modules external, everything else inlined; `use-intl` / `@xyflow/react` / `zustand` deduplicated to one copy (`import.meta.resolve`); CSS injected as `<style data-plugin="dsh-tongflow">`; `@sparkjsdev/spark` external (3D node preview degrades).

## Not in scope (yet)

- dsh attachments accept images only; video/audio reach the model via `tongflow_perceive` and contact sheets.
- No `conversation.chat.node` progress card yet — runs show in the Studio's inspector and dsh's job list.
