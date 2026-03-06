import { WorkItemStatus } from './types.js';

// Valid transitions: from -> allowed next states
const TRANSITIONS: Record<WorkItemStatus, ReadonlyArray<WorkItemStatus>> = {
  [WorkItemStatus.New]: [WorkItemStatus.Queued, WorkItemStatus.Cancelled],
  [WorkItemStatus.Queued]: [WorkItemStatus.Running, WorkItemStatus.Cancelled, WorkItemStatus.Failed],
  [WorkItemStatus.Running]: [
    WorkItemStatus.WaitingForCi,
    WorkItemStatus.WaitingForHuman,
    WorkItemStatus.Completed,
    WorkItemStatus.Failed,
    WorkItemStatus.Cancelled,
  ],
  [WorkItemStatus.WaitingForCi]: [WorkItemStatus.Running, WorkItemStatus.Failed, WorkItemStatus.Cancelled],
  [WorkItemStatus.WaitingForHuman]: [WorkItemStatus.Running, WorkItemStatus.Cancelled],
  [WorkItemStatus.Completed]: [],
  [WorkItemStatus.Failed]: [],
  [WorkItemStatus.Cancelled]: [],
};

export function canTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return (TRANSITIONS[from] as ReadonlyArray<WorkItemStatus>).includes(to);
}

export function assertTransition(from: WorkItemStatus, to: WorkItemStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

export function allowedTransitions(from: WorkItemStatus): ReadonlyArray<WorkItemStatus> {
  return TRANSITIONS[from];
}
