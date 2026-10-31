import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SkillProblem, SkillSummary } from "../../api/types";

// The installed skills and the folders that could not be read. Reloads on demand.
export function useSkills() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [problems, setProblems] = useState<SkillProblem[]>([]);
  const [error, setError] = useState<string>();

  async function load() {
    try {
      const data = await api.get<{ skills: SkillSummary[]; problems: SkillProblem[] }>("/api/skills");
      setSkills(data.skills);
      setProblems(data.problems);
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { skills, problems, error, setError, load };
}
