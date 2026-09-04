const { pool } = require('../config/db');
const {
  TASK_STATUSES,
  normalizeTaskInput,
} = require('../utils/taskRules');

const TASK_COLUMNS = `
  id,
  title,
  description,
  status,
  due_date,
  due_notified_at,
  created_at,
  updated_at
`;

function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const mysqlDatePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
    const parseableValue = mysqlDatePattern.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}Z`
      : trimmed;
    const parsed = new Date(parseableValue);

    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapTaskRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    dueDate: toIsoString(row.due_date),
    dueNotifiedAt: toIsoString(row.due_notified_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function createValidationError(message, field = 'status') {
  const error = new Error(message);
  error.name = 'ValidationError';
  error.statusCode = 400;
  error.details = [{ field, message }];
  return error;
}

function isSupportedStatus(status) {
  if (Array.isArray(TASK_STATUSES)) {
    return TASK_STATUSES.includes(status);
  }

  if (TASK_STATUSES instanceof Set) {
    return TASK_STATUSES.has(status);
  }

  return Object.values(TASK_STATUSES || {}).includes(status);
}

function normalizeStatus(status) {
  const normalizedStatus =
    typeof status === 'string' ? status.trim().toLowerCase() : status;

  if (!isSupportedStatus(normalizedStatus)) {
    throw createValidationError(
      `Status must be one of: ${Array.from(
        TASK_STATUSES instanceof Set
          ? TASK_STATUSES
          : Object.values(TASK_STATUSES || {}),
      ).join(', ')}`,
    );
  }

  return normalizedStatus;
}

function toDatabaseDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw createValidationError('Due date must be a valid date', 'dueDate');
    }

    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError('Due date must be a valid date', 'dueDate');
  }

  return parsed;
}

function prepareEditableFields(input, defaultStatus = 'todo') {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = normalizeTaskInput(source) || {};

  const title = normalized.title ?? source.title;
  const description =
    normalized.description ?? source.description ?? '';
  const rawStatus = normalized.status ?? source.status ?? defaultStatus;
  const rawDueDate =
    Object.prototype.hasOwnProperty.call(normalized, 'dueDate')
      ? normalized.dueDate
      : Object.prototype.hasOwnProperty.call(normalized, 'due_date')
        ? normalized.due_date
        : Object.prototype.hasOwnProperty.call(source, 'dueDate')
          ? source.dueDate
          : source.due_date;

  return {
    title,
    description,
    status: normalizeStatus(rawStatus),
    dueDate: toDatabaseDate(rawDueDate),
  };
}

async function findTaskById(userId, taskId) {
  const [rows] = await pool.execute(
    `SELECT ${TASK_COLUMNS}
       FROM tasks
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [taskId, userId],
  );

  return rows.length > 0 ? mapTaskRow(rows[0]) : null;
}

async function listTasks(userId, status) {
  const parameters = [userId];
  let query = `
    SELECT ${TASK_COLUMNS}
      FROM tasks
     WHERE user_id = ?
  `;

  if (status !== undefined && status !== null) {
    query += ' AND status = ?';
    parameters.push(normalizeStatus(status));
  }

  query += `
    ORDER BY
      CASE status
        WHEN 'todo' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'done' THEN 3
        ELSE 4
      END,
      due_date IS NULL,
      due_date ASC,
      created_at DESC,
      id DESC
  `;

  const [rows] = await pool.execute(query, parameters);
  return rows.map(mapTaskRow);
}

async function createTask(userId, input) {
  const { title, description, status, dueDate } = prepareEditableFields(input);

  const [result] = await pool.execute(
    `INSERT INTO tasks
      (user_id, title, description, status, due_date, due_notified_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    [userId, title, description, status, dueDate],
  );

  const task = await findTaskById(userId, result.insertId);

  if (!task) {
    throw new Error('The task was created but could not be retrieved');
  }

  return task;
}

async function updateTask(userId, taskId, input) {
  const { title, description, status, dueDate } = prepareEditableFields(input);

  await pool.execute(
    `UPDATE tasks
        SET due_notified_at = CASE
              WHEN NOT (due_date <=> ?)
                OR (status = 'done' AND ? <> 'done')
              THEN NULL
              ELSE due_notified_at
            END,
            title = ?,
            description = ?,
            status = ?,
            due_date = ?
      WHERE id = ? AND user_id = ?`,
    [
      dueDate,
      status,
      title,
      description,
      status,
      dueDate,
      taskId,
      userId,
    ],
  );

  return findTaskById(userId, taskId);
}

async function updateTaskStatus(userId, taskId, status) {
  const normalizedStatus = normalizeStatus(status);

  await pool.execute(
    `UPDATE tasks
        SET due_notified_at = CASE
              WHEN status = 'done' AND ? <> 'done'
              THEN NULL
              ELSE due_notified_at
            END,
            status = ?
      WHERE id = ? AND user_id = ?`,
    [normalizedStatus, normalizedStatus, taskId, userId],
  );

  return findTaskById(userId, taskId);
}

async function deleteTask(userId, taskId) {
  const [result] = await pool.execute(
    'DELETE FROM tasks WHERE id = ? AND user_id = ?',
    [taskId, userId],
  );

  return result.affectedRows > 0;
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};