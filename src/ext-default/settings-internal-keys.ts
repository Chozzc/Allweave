/**
 * Default internal-key predicate: no env key is platform-internal.
 *
 * A cloud shell substitutes its own `src/ext/settings-internal-keys.ts`
 * (gitignored, linked in at build time) to hide keys it writes into the user
 * env store for its own bookkeeping (e.g. executor endpoints). Internal keys
 * are never returned to the settings UI and are preserved verbatim across
 * settings saves.
 */
export function isInternalEnvKey(_key: string): boolean {
    return false;
}
