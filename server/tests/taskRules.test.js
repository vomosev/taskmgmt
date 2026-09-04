import { describe, expect, it } from 'vitest';

import {
  TASK_STATUSES,
  isOverdue,
  normalizeTaskInput,
  validateCreateTask,
  validateStatus,
  validateUpdateTask,
} from '../utils/taskRules.js';

function getValidationOutcome(validator, value) {
  try {
    const result = validator(value);

    if (result === undefined || result === null) {
      return { valid: true, result };
    }

    if (typeof result === 'boolean') {
      return { valid: result, result };
    }

    if (typeof result === 'string') {
      return { valid: result.trim().length === 0, result };
    }

    if (Array.isArray(result)) {
      return { valid: result.length === 0, result };
    }

    if (typeof result === 'object') {
      if (typeof result.valid === 'boolean') {
        return { valid: result.valid, result };
      }

      if (typeof result.isValid === 'boolean') {
        return { valid: result.isValid, result };
      }

      if (typeof result.success === 'boolean') {
        return { valid: result.success, result };
      }

      if (Array.isArray(result.errors)) {
        return { valid: result.errors.length === 0, result };
      }

      if (result.errors && typeof result.errors === 'object') {
        return {
          valid: Object.keys(result.errors).length === 0,
          result,
        };
      }

      if (result.error) {
        return { valid: false, result };
      }

      const keys = Object.keys(result);
      const looksLikeErrorMap =
        keys.length > 0 &&
        keys.every((key) =>
          ['title', 'description', 'status', 'dueDate', 'due_date', 'body', 'message'].includes(
            key,
          ),
        ) &&
        Object.values(result).every(
          (entry) => typeof entry === 'string' || Array.isArray(entry),
        );

      return { valid: !looksLikeErrorMap, result };
    }

    return { valid: true, result };
  } catch (error) {
    return { valid: false, error };
  }
}

function expectValid(validator, value) {
  const outcome = getValidationOutcome(validator, value);
  expect(outcome.valid).toBe(true);
}

function expectInvalid(validator, value) {
  const outcome = getValidationOutcome(validator, value);
  expect(outcome.valid).toBe(false);
}

describe('taskRules', () => {
  const openStatus = TASK_STATUSES.includes('todo')
    ? 'todo'
    : TASK_STATUSES.find((status) => status !== 'done');
  const activeStatus =
    TASK_STATUSES.find((status) => status !== openStatus && status !== 'done') ??
    openStatus;
  const completedStatus = TASK_STATUSES.includes('done')
    ? 'done'
    : TASK_STATUSES[TASK_STATUSES.length - 1];

  describe('normalizeTaskInput', () => {
    it('normalizes a valid task by trimming text and preserving its due instant', () => {
      const dueDate = '2030-05-20T14:30:00.000Z';
      const input = {
        title: '  Prepare product launch  ',
        description: '  Coordinate the release checklist.  ',
        status: activeStatus,
        dueDate,
      };

      const normalized = normalizeTaskInput(input);

      expect(normalized.title).toBe('Prepare product launch');
      expect(normalized.description).toBe('Coordinate the release checklist.');
      expect(normalized.status).toBe(activeStatus);
      expect(new Date(normalized.dueDate).toISOString()).toBe(dueDate);
      expect(input.title).toBe('  Prepare product launch  ');
      expect(input.description).toBe('  Coordinate the release checklist.  ');
    });

    it('produces input accepted by create validation for a valid task', () => {
      const normalized = normalizeTaskInput({
        title: 'Write release notes',
        description: 'Summarize user-facing changes.',
        status: openStatus,
        dueDate: '2030-06-01T09:00:00.000Z',
      });

      expectValid(validateCreateTask, normalized);
    });
  });

  describe('title validation', () => {
    it.each(['', '   ', '\n\t'])('rejects a blank title: %j', (title) => {
      expectInvalid(validateCreateTask, {
        title,
        description: '',
        status: openStatus,
        dueDate: null,
      });
    });

    it('rejects a title exceeding the supported database length', () => {
      expectInvalid(validateCreateTask, {
        title: 'x'.repeat(256),
        description: '',
        status: openStatus,
        dueDate: null,
      });
    });
  });

  describe('status and due-date validation', () => {
    it('accepts every documented task status', () => {
      expect(TASK_STATUSES.length).toBeGreaterThan(0);

      for (const status of TASK_STATUSES) {
        expectValid(validateStatus, status);
      }
    });

    it.each(['blocked', 'archived', '', null, 42])(
      'rejects an unsupported status: %j',
      (status) => {
        expectInvalid(validateStatus, status);
      },
    );

    it('rejects an unsupported status during task creation', () => {
      expectInvalid(validateCreateTask, {
        title: 'Invalid status task',
        description: '',
        status: 'blocked',
        dueDate: null,
      });
    });

    it.each(['not-a-date', 'tomorrow afternoon', '2026-13-45T99:00:00Z'])(
      'rejects an invalid due date: %j',
      (dueDate) => {
        expectInvalid(validateCreateTask, {
          title: 'Invalid due date task',
          description: '',
          status: openStatus,
          dueDate,
        });
      },
    );

    it('accepts a nullable due date', () => {
      expectValid(validateCreateTask, {
        title: 'Task without a deadline',
        description: '',
        status: openStatus,
        dueDate: null,
      });
    });
  });

  describe('partial update validation', () => {
    it('accepts an update containing only a description', () => {
      expectValid(validateUpdateTask, {
        description: 'Only this field changed.',
      });
    });

    it('accepts clearing the due date without requiring unrelated fields', () => {
      expectValid(validateUpdateTask, {
        dueDate: null,
      });
    });

    it('accepts a status-only update when the status is supported', () => {
      expectValid(validateUpdateTask, {
        status: activeStatus,
      });
    });

    it('validates supplied fields even when the rest of the task is omitted', () => {
      expectInvalid(validateUpdateTask, {
        title: '   ',
      });

      expectInvalid(validateUpdateTask, {
        status: 'blocked',
      });

      expectInvalid(validateUpdateTask, {
        dueDate: 'invalid-date',
      });
    });
  });

  describe('isOverdue', () => {
    const now = new Date('2030-01-15T12:00:00.000Z');

    it('returns true for an incomplete task with a due date before now', () => {
      expect(
        isOverdue(
          {
            status: openStatus,
            dueDate: '2030-01-15T11:59:59.000Z',
          },
          now,
        ),
      ).toBe(true);
    });

    it('returns false for a task due in the future', () => {
      expect(
        isOverdue(
          {
            status: activeStatus,
            dueDate: '2030-01-15T12:00:01.000Z',
          },
          now,
        ),
      ).toBe(false);
    });

    it('returns false when the due date is exactly now', () => {
      expect(
        isOverdue(
          {
            status: openStatus,
            dueDate: now.toISOString(),
          },
          now,
        ),
      ).toBe(false);
    });

    it('returns false for a completed task even when its due date has passed', () => {
      expect(
        isOverdue(
          {
            status: completedStatus,
            dueDate: '2030-01-01T00:00:00.000Z',
          },
          now,
        ),
      ).toBe(false);
    });

    it('returns false when the task has no due date', () => {
      expect(
        isOverdue(
          {
            status: openStatus,
            dueDate: null,
          },
          now,
        ),
      ).toBe(false);
    });
  });
});