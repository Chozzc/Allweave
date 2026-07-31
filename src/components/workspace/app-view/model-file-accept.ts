/**
 * Accept string for 3D model uploads, flattened from the canonical format
 * catalog maintained next to the model node.
 */

import { FORMAT_CATEGORIES } from "@/components/workspace/nodes/modality/model-node.formats";

export const MODEL_FILE_ACCEPT = Array.from(
    new Set(
        Object.values(FORMAT_CATEGORIES).flatMap(
            (category) => category.formats,
        ),
    ),
).join(",");
