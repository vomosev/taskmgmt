const MYSQL_ERROR_RESPONSES = {
  ER_DUP_ENTRY: {
    status: 409,
    message: 'A resource with the same value already exists.',
  },
  ER_NO_REFERENCED_ROW_2: {
    status: 400,
    message: 'A referenced resource does not exist.',
  },
  ER_ROW_IS_REFERENCED_2: {
    status: 409,
    message: 'The resource cannot be deleted because it is still in use.',
  },
  ER_BAD_NULL_ERROR: {
    status: 400,
    message: 'A required value is missing.',
  },
  ER_DATA_TOO_LONG: {
    status: 400,
    message: 'One or more values exceed the allowed length.',
  },
  ER_TRUNCATED_WRONG_VALUE: {
    status: 400,
    message: 'One or more values are invalid.',
  },
  WARN_DATA_TRUNCATED: {
    status: 400,
    message: 'One or more values are invalid.',
  },
  ER_CHECK_CONSTRAINT_VIOLATED: {
    status: 400,
    message: 'One or more values violate a data constraint.',
  },
  ER_LOCK_DEADLOCK: {
    status: 503,
    message: 'The request could not be completed. Please try again.',
  },
  ER_LOCK_WAIT_TIMEOUT: {
    status: 503,
    message: 'The request could not be completed. Please try again.',
  },
  ER_CON_COUNT_ERROR: {
    status: 503,
    message: 'The service is temporarily unavailable.',
  },
  PROTOCOL_CONNECTION_LOST: {
    status: 503,
    message: 'The service is temporarily unavailable.',
  },
  ECONNREFUSED: {
    status: 503,
    message: 'The service is temporarily unavailable.',
  },
};

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|cookie|credential|api[-_]?key/i;

function sanitizeText(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized ? normalized.slice(0, 500) : fallback;
}

function sanitizeDetails(value, depth = 0, seen = new WeakSet()) {
  if (value == null || depth > 4) {
    return value == null ? value : '[truncated]';
  }

  if (typeof value === 'string') {
    return value.slice(0, 1000);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error || typeof value !== 'object') {
    return undefined;
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeDetails(item, depth + 1, seen))
      .filter((item) => item !== undefined);
  }

  const sanitized = {};

  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    const cleanItem = sanitizeDetails(item, depth + 1, seen);
    if (cleanItem !== undefined) {
      sanitized[key] = cleanItem;
    }
  }

  return sanitized;
}

function getClientError(err) {
  if (
    err instanceof SyntaxError &&
    (err.status === 400 || err.statusCode === 400) &&
    (err.type === 'entity.parse.failed' || Object.hasOwn(err, 'body'))
  ) {
    return {
      status: 400,
      message: 'Invalid JSON payload.',
      known: true,
    };
  }

  const mysqlResponse = MYSQL_ERROR_RESPONSES[err?.code];
  if (mysqlResponse) {
    return {
      ...mysqlResponse,
      known: mysqlResponse.status < 500,
    };
  }

  if (
    err?.name === 'ValidationError' ||
    err?.code === 'VALIDATION_ERROR' ||
    err?.type === 'validation'
  ) {
    return {
      status: 400,
      message: sanitizeText(err.message, 'Validation failed.'),
      details: err.details ?? err.errors,
      known: true,
    };
  }

  const suppliedStatus = Number(err?.statusCode ?? err?.status);
  if (
    Number.isInteger(suppliedStatus) &&
    suppliedStatus >= 400 &&
    suppliedStatus < 500
  ) {
    return {
      status: suppliedStatus,
      message: sanitizeText(err.message, 'The request could not be completed.'),
      details: err.details,
      known: true,
    };
  }

  return {
    status: 500,
    message: 'Internal server error.',
    known: false,
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const clientError = getClientError(err);

  if (!clientError.known) {
    const logEntry = {
      method: req.method,
      path: req.path,
      status: clientError.status,
      code: err?.code,
      name: err?.name,
      message: err?.message || 'Unknown error',
    };

    if (process.env.NODE_ENV !== 'production' && err?.stack) {
      logEntry.stack = err.stack;
    }

    console.error('Unexpected request failure', logEntry);
  }

  const response = {
    error: clientError.message,
  };

  if (clientError.details !== undefined && clientError.status < 500) {
    const details = sanitizeDetails(clientError.details);
    if (
      details !== undefined &&
      details !== null &&
      (!Array.isArray(details) || details.length > 0) &&
      (Array.isArray(details) ||
        typeof details !== 'object' ||
        Object.keys(details).length > 0)
    ) {
      response.details = details;
    }
  }

  return res.status(clientError.status).json(response);
}

export default errorHandler;