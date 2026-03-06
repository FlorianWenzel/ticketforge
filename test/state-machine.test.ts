import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canTransition, assertTransition, allowedTransitions } from '../src/domain/state-machine.js';
import { WorkItemStatus } from '../src/domain/types.js';

describe('state-machine', () => {
  it('allows valid transitions', () => {
    assert.equal(canTransition(WorkItemStatus.New, WorkItemStatus.Queued), true);
    assert.equal(canTransition(WorkItemStatus.Queued, WorkItemStatus.Running), true);
    assert.equal(canTransition(WorkItemStatus.Running, WorkItemStatus.WaitingForCi), true);
    assert.equal(canTransition(WorkItemStatus.Running, WorkItemStatus.Completed), true);
    assert.equal(canTransition(WorkItemStatus.WaitingForCi, WorkItemStatus.Running), true);
    assert.equal(canTransition(WorkItemStatus.Running, WorkItemStatus.Failed), true);
  });

  it('rejects invalid transitions', () => {
    assert.equal(canTransition(WorkItemStatus.Completed, WorkItemStatus.Running), false);
    assert.equal(canTransition(WorkItemStatus.Failed, WorkItemStatus.Queued), false);
    assert.equal(canTransition(WorkItemStatus.New, WorkItemStatus.Completed), false);
    assert.equal(canTransition(WorkItemStatus.New, WorkItemStatus.Running), false);
  });

  it('throws on invalid transition via assertTransition', () => {
    assert.throws(
      () => assertTransition(WorkItemStatus.Completed, WorkItemStatus.Running),
      /Invalid state transition/,
    );
  });

  it('returns allowed transitions for each state', () => {
    const allowed = allowedTransitions(WorkItemStatus.Running);
    assert.ok(allowed.includes(WorkItemStatus.Completed));
    assert.ok(allowed.includes(WorkItemStatus.WaitingForCi));
    assert.ok(allowed.includes(WorkItemStatus.Failed));
  });

  it('terminal states have no allowed transitions', () => {
    assert.deepEqual(allowedTransitions(WorkItemStatus.Completed), []);
    assert.deepEqual(allowedTransitions(WorkItemStatus.Failed), []);
    assert.deepEqual(allowedTransitions(WorkItemStatus.Cancelled), []);
  });
});
