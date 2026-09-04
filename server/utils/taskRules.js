'use strict';

const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'done']);

const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;
const EDITABLE_FIELDS = Object.freeze([
  'title',
  'description',
  'status',
  'dueDate',
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function validateStatus(status) {
  return typeof status === 'string' && TASK_STATUSES.includes(status.trim());
}

function isValidDueDate(value) {
  if (value === null || value === undefined || value === '') {
    return true;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  return Number.isFinite(Date.parse(value.trim()));
}

function createValidationError(details) {
  const error = new Error('Task validation failed');
  error.name = 'ValidationError';
  error.code = 'VALIDATION_ERROR';
  error.status = 400;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function validateTitle(title, required, errors) {
  if (title === undefined && !required) {
    return;
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push({
      field: 'title',
      message: 'Title is required and must not be blank.',
    });
    return;
  }

  if (title.trim().length > MAX_TITLE_LENGTH) {
    errors.push({
      field: 'title',
      message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
    });
  }
}

function validateDescription(description, errors) {
  if (description === undefined || description === null) {
    return;
  }

  if (typeof description !== 'string') {
    errors.push({
      field: 'description',
      message: 'Description must be a string.',
    });
    return;
  }

  if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.push({
      field: 'description',
      message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
    });
  }
}

function validateTaskStatus(status, required, errors) {
  if (status === undefined && !required) {
    return;
  }

  if (!validateStatus(status)) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${TASK_STATUSES.join(', ')}.`,
    });
  }
}

function validateDueDate(dueDate, errors) {
  if (!isValidDueDate(dueDate)) {
    errors.push({
      field: 'dueDate',
      message: 'Due date must be null or a valid date.',
    });
  }
}

function validateCreateTask(input) {
  if (!isPlainObject(input)) {
    throw createValidationError([
      {
        field: 'task',
        message: 'Task data must be a JSON object.',
      },
    ]);
  }

  const errors = [];

  validateTitle(input.title, true, errors);
  validateDescription(input.description, errors);

  if (hasOwn(input, 'status')) {
    validateTaskStatus(input.status, true, errors);
  }

  if (hasOwn(input, 'dueDate')) {
    validateDueDate(input.dueDate, errors);
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return true;
}

function validateUpdateTask(input) {
  if (!isPlainObject(input)) {
    throw createValidationError([
      {
        field: 'task',
        message: 'Task data must be a JSON object.',
      },
    ]);
  }

  const errors = [];
  const suppliedFields = EDITABLE_FIELDS.filter((field) =>
    hasOwn(input, field),
  );

  if (suppliedFields.length === 0) {
    errors.push({
      field: 'task',
      message: 'At least one editable task field must be provided.',
    });
  }

  if (hasOwn(input, 'title')) {
    validateTitle(input.title, true, errors);
  }

  if (hasOwn(input, 'description')) {
    validateDescription(input.description, errors);
  }

  if (hasOwn(input, 'status')) {
    validateTaskStatus(input.status, true, errors);
  }

  if (hasOwn(input, 'dueDate')) {
    validateDueDate(input.dueDate, errors);
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return true;
}

function normalizeDueDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    const timestamp = Date.parse(normalizedValue);

    return Number.isFinite(timestamp)
      ? new Date(timestamp)
      : normalizedValue;
  }

  return value;
}

function normalizeTaskInput(input, options = {}) {
  const partial =
    typeof options === 'boolean'
      ? options
      : Boolean(options && (options.partial || options.isPartial));

  const source = isPlainObject(input) ? input : {};
  const normalized = {};

  if (!partial || hasOwn(source, 'title')) {
    normalized.title =
      typeof source.title === 'string' ? source.title.trim() : source.title;
  }

  if (!partial || hasOwn(source, 'description')) {
    normalized.description =
      source.description === null || source.description === undefined
        ? ''
        : typeof source.description === 'string'
          ? source.description.trim()
          : source.description;
  }

  if (!partial || hasOwn(source, 'status')) {
    normalized.status =
      source.status === undefined && !partial
        ? 'todo'
        : typeof source.status === 'string'
          ? source.status.trim()
          : source.status;
  }

  if (!partial || hasOwn(source, 'dueDate')) {
    normalized.dueDate = normalizeDueDate(source.dueDate);
  }

  return normalized;
}

function isOverdue(task, now = new Date()) {
  if (!task || typeof task !== 'object' || task.status === 'done') {
    return false;
  }

  const dueDate = task.dueDate ?? task.due_date;

  if (dueDate === null || dueDate === undefined || dueDate === '') {
    return false;
  }

  const dueTimestamp =
    dueDate instanceof Date
      ? dueDate.getTime()
      : typeof dueDate === 'string'
        ? Date.parse(dueDate)
        : Number.NaN;

  const nowTimestamp =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'string' || typeof now === 'number'
        ? new Date(now).getTime()
        : Number.NaN;

  if (!Number.isFinite(dueTimestamp) || !Number.isFinite(nowTimestamp)) {
    return false;
  }

  return dueTimestamp < nowTimestamp;
}

module.exports = {
  TASK_STATUSES,
  validateCreateTask,
  validateUpdateTask,
  validateStatus,
  normalizeTaskInput,
  isOverdue,
};