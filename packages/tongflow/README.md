# tongflow

Framework-free core of [TongFlow](https://github.com/tong-io/tongflow), the
multi-modal AIGC workflow studio: the ABI contract, the static node registry,
connection validation, the workflow exporter, canvas layout, a **headless
canvas model** and the **agent graph tools** that let an external agent build
and edit workflows programmatically.

No React, no Next.js, no I/O — it runs in Node, browsers and workers alike.
Execution is not in this package: export a workflow and hand it to the
Python SDK engine (`pip install tongflow`, `python -m tongflow.engine`).

```sh
npm install tongflow zustand
```

`zustand` is a peer dependency (the headless store is a `zustand/vanilla`
store). `@xyflow/react` is an optional peer used for its `Node` / `Edge` types
only.

## What's inside

| Area | Exports (selection) |
|---|---|
| ABI contract | `ABI_NODES`, `ABI_DEFINITIONS`, `NodeSlot`, generated per-slot input/output types, `TONGFLOW_ABI_VERSION`; the JSON itself at `tongflow/abi` |
| Static node registry | `NODE_TYPE_TO_ABI_FEATURE`, `NODE_TYPE_SOURCE_SPEC`, `abiSpecForNodeType`, `resolvedSpecForNodeType`, `resolveEdgeHandles`, `getAbiTopology`, `resolveSpec` |
| Workflow | `exportWorkflow` → `ExecutableWorkflow`, `WorkflowParser`, `isWorkflowValid`, `isValidFlowConnection`, `getEdgeTargetOptions`, `parseWorkflowImportJson` |
| Layout | `computeAutoLayout`, `componentsContaining`, `estimateNodeSize` |
| Headless store | `createFlowStore`, `createFlowSlice`, `FlowCoreState`, `addEdgeIfAbsent` |
| Agent tools | `TONGFLOW_TOOL_DEFS`, `applyGraphPatch`, `readCanvas`, `validateWorkflow`, `describeNodeType`, `executeGraphTool`, `renderCanvas` |
| Registry schemas | `PluginsRegistrySchema`, `FeatureRegistryBundleSchema` (zod) |

## Build a workflow headlessly

```ts
import {
    createFlowStore,
    applyGraphPatch,
    validateWorkflow,
    exportWorkflow,
} from "tongflow";

const store = createFlowStore();

// One coherent change: nodes to create, edges to draw, params to set.
const result = applyGraphPatch(store, {
    add_nodes: [
        { alias: "t1", type: "textNode", data: { texts: ["a cat, cartoon"] } },
        { alias: "gen", type: "textGenImageNode", data: { width: 1024, height: 1024 } },
        { alias: "img", type: "imageNode" },
    ],
    add_edges: [
        { from: "t1", to: "gen" },
        { from: "gen", to: "img" },
    ],
});
console.log(result.ok, result.steps);

// Health-check (cycles, unconnected required inputs, empty config, plugins).
console.log(validateWorkflow(store, { registry: myPluginsRegistry }));

// Export the executable form the Python engine runs.
const { nodes, edges } = store.getState();
const executable = exportWorkflow(nodes, edges, { name: "cat" });
```

Give an LLM the tools with your provider's envelope and dispatch by name:

```ts
import { TONGFLOW_TOOL_DEFS, executeGraphTool } from "tongflow";

const openaiTools = TONGFLOW_TOOL_DEFS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// ...when the model calls a tool:
const out = executeGraphTool(store, call.name, call.arguments, {
    historySource: `agent:${turnId}`,
    registry: myPluginsRegistry,
});
```

The graph rules an agent must follow (the strict
`add → data → executable → data → …` alternation, never inventing ids, etc.)
are documented in
[`docs/agent-workflow-manual.md`](https://github.com/tong-io/tongflow/blob/main/docs/agent-workflow-manual.md).

## Embedding in a React canvas

The TongFlow app itself layers React Flow callbacks over `createFlowSlice`:

```ts
import { create } from "zustand";
import { createFlowSlice, type FlowCoreState } from "tongflow";

const useFlow = create<FlowCoreState & MyBindings>()((set, get) => ({
    ...createFlowSlice(set, get),
    onNodesChange: (changes) => { /* applyNodeChanges + set({ nodes }) */ },
    // ...
}));
useFlow.subscribe((s, prev) => { if (s.nodes !== prev.nodes) persist(s.nodes); });
```

A ready-made React canvas (`tongflow/canvas`) is on the roadmap.

## Versioning

The ABI (`tongflow/abi`) is versioned independently (`TONGFLOW_ABI_VERSION`);
the Python SDK bundles the same JSON. Keep the npm package and
`pip install tongflow` on matching ABI versions.

License: AGPL-3.0-only.
