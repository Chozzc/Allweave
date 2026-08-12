/**
 * Merge a skill's prompt body with the user's own instruction into the single
 * `userPrompt` string the gen-text ABI slot accepts. The skill body leads so it
 * acts as the framing instruction; either part may be empty.
 */
export function composeSkillPrompt(
    skillBody: string,
    userPrompt: string,
): string {
    return [skillBody.trim(), userPrompt.trim()].filter(Boolean).join("\n\n");
}
