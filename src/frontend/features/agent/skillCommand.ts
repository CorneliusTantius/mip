import type { SkillSummary } from "../../api/types";

// The name typed after a "/" that starts the message, while the name is still being typed. Undefined once a space follows the
// name, or when the message does not start with "/".
export function skillCommandQuery(draft: string): string | undefined {
  return /^\/([^\s]*)$/.exec(draft)?.[1];
}

// The installed skills whose name holds the typed text, ignoring case. A name that starts with the text comes first.
export function matchingSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const needle = query.toLowerCase();
  return skills
    .filter((skill) => skill.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(!a.name.startsWith(needle)) - Number(!b.name.startsWith(needle)) || a.name.localeCompare(b.name));
}
