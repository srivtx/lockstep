import { runRules } from "./rules.ts";
import { scanProject } from "./scan.ts";
import { PARSE_ERROR_CODE, type Issue, type LockstepResult, type Severity } from "./types.ts";

function countIssues(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}

export function auditFailure(file: string, message: string): LockstepResult {
  const issues: Issue[] = [
    {
      code: PARSE_ERROR_CODE,
      severity: "error",
      message,
      location: file,
      file,
    },
  ];
  return { file, sources: [], issues, counts: countIssues(issues) };
}

export function auditProject(dir: string): LockstepResult {
  let scanned;
  try {
    scanned = scanProject(dir);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return auditFailure(
      dir,
      `Could not scan project: ${detail}. No findings were produced; this is not a clean result.`,
    );
  }

  const issues = runRules(scanned.facts);
  return { file: dir, sources: scanned.sources, issues, counts: countIssues(issues) };
}
