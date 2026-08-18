/**
 * dsh-tongflow — host (Node) half.
 *
 * A Cordis plugin mounted by the dsh Loader. Registers the TongFlow studio:
 * project model, agent tools, workflow engine bridge, HTTP routes for the
 * embedded canvas, skills and settings.
 */
import type { Context } from "@deepseek-ai/cordis";

export const name = "dsh-tongflow";

export const inject: string[] = [];

export interface Config {}

export function apply(_ctx: Context, _config: Config): void {
    // Skeleton: capabilities land in follow-up steps.
}
