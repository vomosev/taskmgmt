const taskService = require('../services/taskService');
const {
  TASK_STATUSES,
  validateCreateTask,
  validateUpdateTask,
  validateStatus,
  normalizeTaskInput,
} = require('../utils/taskRules');

const hasOwn = (object, property) =>
  Object.prototype.hasOwnProperty.call(object, property);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTaskId(value) {
  const stringValue = String(value);

  if (!/^[1-9]\d*$/.test(stringValue)) {
    return null;
  }

  const id = Number(stringValue);
  return Number.isSafeInteger(id) ? id : null;
}

function getValidationDetails(result, fallbackMessage) {
  if (result === undefined || result === null || result === true) {
    return null;
  }

  if (result === false) {
    return [fallbackMessage];
  }

  if (typeof result === 'string') {
    return result.trim() ? [result] : null;
  }

  if (Array.isArray(result)) {
    return result.length > 0 ? result : null;
  }

  if (typeof result === 'object') {
    const details = result.errors ?? result.details;

    if (Array.isArray(details)) {
      return details.length > 0 ? details : null;
    }

    if (details && typeof details === 'object') {
      return Object.keys(details).length > 0 ? details : null;
    }

    if (typeof details === 'string' && details.trim()) {
      return [details];
    }

    if (result.valid === false || result.isValid === false) {
      return [fallbackMessage];
    }
  }

  return null;
}

function sendValidationError(res, details) {
  return res.status(400).json({
    error: 'Validation failed',
    details: Array.isArray(details) || isPlainObject(details)
      ? details
      : [String(details)],
  });
}

function validateTaskId(req, res) {
  const taskId = parseTaskId(req.params.id);

  if (taskId === null) {
    res.status(400).json({ error: 'Invalid task ID' });
    return null;
  }

  return taskId;
}

async function listTasks(req, res, next) {
  try {
    let status;

    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        return sendValidationError(res, [
          'status must be a single valid task status',
        ]);
      }

      status = req.query.status.trim();
      const statusErrors = getValidationDetails(
        validateStatus(status),
        `status must be one of: ${TASK_STATUSES.join(', ')}`
      );

      if (statusErrors) {
        return sendValidationError(res, statusErrors);
      }

      if (!TASK_STATUSES.includes(status)) {
        return sendValidationError(res, [
          `status must be one of: ${TASK_STATUSES.join(', ')}`,
        ]);
      }
    }

    const tasks = await taskService.listTasks(req.user.id, status);
    return res.status(200).json({ tasks });
  } catch (error) {
    return next(error);
  }
}

async function createTask(req, res, next) {
  try {
    if (!isPlainObject(req.body)) {
      return sendValidationError(res, [
        'Request body must be a JSON object',
      ]);
    }

    const validationErrors = getValidationDetails(
      validateCreateTask(req.body),
      'Task data is invalid'
    );

    if (validationErrors) {
      return sendValidationError(res, validationErrors);
    }

    const taskData = normalizeTaskInput(req.body);
    const task = await taskService.createTask(req.user.id, taskData);

    return res.status(201).json({ task });
  } catch (error) {
    return next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const taskId = validateTaskId(req, res);
    if (taskId === null) {
      return undefined;
    }

    if (!isPlainObject(req.body)) {
      return sendValidationError(res, [
        'Request body must be a JSON object',
      ]);
    }

    if (Object.keys(req.body).length === 0) {
      return sendValidationError(res, [
        'At least one task field must be provided',
      ]);
    }

    const validationErrors = getValidationDetails(
      validateUpdateTask(req.body),
      'Task data is invalid'
    );

    if (validationErrors) {
      return sendValidationError(res, validationErrors);
    }

    const taskData = normalizeTaskInput(req.body);
    const task = await taskService.updateTask(
      req.user.id,
      taskId,
      taskData
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(200).json({ task });
  } catch (error) {
    return next(error);
  }
}

async function updateTaskStatus(req, res, next) {
  try {
    const taskId = validateTaskId(req, res);
    if (taskId === null) {
      return undefined;
    }

    if (!isPlainObject(req.body)) {
      return sendValidationError(res, [
        'Request body must be a JSON object',
      ]);
    }

    if (!hasOwn(req.body, 'status')) {
      return sendValidationError(res, ['status is required']);
    }

    if (typeof req.body.status !== 'string') {
      return sendValidationError(res, [
        `status must be one of: ${TASK_STATUSES.join(', ')}`,
      ]);
    }

    const status = req.body.status.trim();
    const validationErrors = getValidationDetails(
      validateStatus(status),
      `status must be one of: ${TASK_STATUSES.join(', ')}`
    );

    if (validationErrors) {
      return sendValidationError(res, validationErrors);
    }

    if (!TASK_STATUSES.includes(status)) {
      return sendValidationError(res, [
        `status must be one of: ${TASK_STATUSES.join(', ')}`,
      ]);
    }

    const task = await taskService.updateTaskStatus(
      req.user.id,
      taskId,
      status
    );

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(200).json({ task });
  } catch (error) {
    return next(error);
  }
}

async function deleteTask(req, res, next) {
  try {
    const taskId = validateTaskId(req, res);
    if (taskId === null) {
      return undefined;
    }

    const deleted = await taskService.deleteTask(req.user.id, taskId);

    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};