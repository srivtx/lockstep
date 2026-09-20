import type { LockstepResult } from "./types.ts";

export function formatSummary(result: LockstepResult): string {
  const counts = result.counts ?? { error: 0, warning: 0, info: 0 };
  return `${result.file}  errors:${counts.error ?? 0}  warnings:${counts.warning ?? 0}  info:${
    counts.info ?? 0
  }`;
}

export function formatText(result: LockstepResult): string {
  const lines: string[] = [formatSummary(result)];
  for (const source of result.sources ?? []) {
    lines.push(`${source.kind}  ${source.source}  ${source.value}`);
  }
  for (const issue of result.issues ?? []) {
    const location = issue.location && issue.location.length > 0 ? issue.location : "-";
    lines.push(`${issue.severity.toUpperCase()}  ${issue.code}  ${location}  ${issue.message}`);
  }
  return lines.join("\n");
}

export function formatJson(result: LockstepResult): string {
  return JSON.stringify(result, null, 2);
}
