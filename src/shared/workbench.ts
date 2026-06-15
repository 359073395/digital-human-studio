export type StepStatus = "waiting" | "running" | "complete" | "failed" | "retry-ready";

export interface WorkbenchStep {
  id: string;
  label: string;
  status: StepStatus;
}

export function countCompleteSteps(steps: WorkbenchStep[]): number {
  return steps.filter((step) => step.status === "complete").length;
}

export function isRetryable(status: StepStatus): boolean {
  return status === "failed" || status === "retry-ready";
}
