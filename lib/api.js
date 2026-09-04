const DEFAULT_API_URL = 'http://localhost:4000/api';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
).replace(/\/+$/, '');

const TASK_STATUSES = new Set(['todo', 'in_progress', 'in-progress', 'done']);

export class ApiError extends Error {
  constructor(message, status = 0, details, data, cause) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.data = data;

    if (cause) {
      this.cause = cause;
    }
  }
}

export { ApiError as APIError };

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}/${String(path).replace(/^\/+/, '')}`;
}

function hasHeader(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function getBearerValue(token) {
  if (typeof token !== 'string') {
    return '';
  }

  return token.replace(/^Bearer\s+/i, '').trim();
}

function shouldSerializeBody(body) {
  if (
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  ) {
    return false;
  }

  return body !== undefined && body !== null;
}

async function parseResponseBody(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest(path, options = {}, bearerToken) {
  const {
    token: optionToken,
    headers: suppliedHeaders = {},
    body,
    ...fetchOptions
  } = options;

  const headers = {
    Accept: 'application/json',
    ...suppliedHeaders,
  };

  const token = getBearerValue(bearerToken ?? optionToken);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let requestBody = body;

  if (shouldSerializeBody(body)) {
    requestBody = JSON.stringify(body);

    if (!hasHeader(headers, 'Content-Type')) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (
    typeof body === 'string' &&
    body.length > 0 &&
    !hasHeader(headers, 'Content-Type')
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let response;

  try {
    response = await fetch(buildUrl(path), {
      ...fetchOptions,
      headers,
      ...(body !== undefined ? { body: requestBody } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'Unable to connect to the API. Please check your connection and try again.',
      0,
      undefined,
      undefined,
      error
    );
  }

  let data;

  try {
    data = await parseResponseBody(response);
  } catch (error) {
    if (!response.ok) {
      throw new ApiError(
        `Request failed with status ${response.status}.`,
        response.status,
        undefined,
        undefined,
        error
      );
    }

    throw new ApiError(
      'The API returned an unreadable response.',
      response.status,
      undefined,
      undefined,
      error
    );
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object'
        ? data.error || data.message
        : typeof data === 'string'
          ? data
          : null;

    throw new ApiError(
      message || `Request failed with status ${response.status}.`,
      response.status,
      data && typeof data === 'object' ? data.details : undefined,
      data
    );
  }

  return data;
}

export const request = apiRequest;

export const authApi = {
  signup(credentials) {
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: credentials,
    });
  },

  login(credentials) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: credentials,
    });
  },

  me(token) {
    return apiRequest('/auth/me', {
      method: 'GET',
      token,
    });
  },

  getCurrentUser(token) {
    return apiRequest('/auth/me', {
      method: 'GET',
      token,
    });
  },

  getMe(token) {
    return apiRequest('/auth/me', {
      method: 'GET',
      token,
    });
  },
};

function resolveListArguments(first, second) {
  if (first && typeof first === 'object') {
    return {
      token: first.token,
      status: first.status,
    };
  }

  if (TASK_STATUSES.has(first) && second !== undefined) {
    return {
      token: second,
      status: first,
    };
  }

  return {
    token: first,
    status: second,
  };
}

function listTasks(first, second) {
  const { token, status } = resolveListArguments(first, second);
  const query = status
    ? `?status=${encodeURIComponent(String(status))}`
    : '';

  return apiRequest(`/tasks${query}`, {
    method: 'GET',
    token,
  });
}

function resolveCreateArguments(first, second) {
  if (first && typeof first === 'object') {
    return {
      token: second,
      payload: first,
    };
  }

  return {
    token: first,
    payload: second,
  };
}

function createTask(first, second) {
  const { token, payload } = resolveCreateArguments(first, second);

  return apiRequest('/tasks', {
    method: 'POST',
    token,
    body: payload,
  });
}

function resolveUpdateArguments(first, second, third) {
  if (second && typeof second === 'object') {
    return {
      id: first,
      payload: second,
      token: third,
    };
  }

  return {
    token: first,
    id: second,
    payload: third,
  };
}

function updateTask(first, second, third) {
  const { token, id, payload } = resolveUpdateArguments(first, second, third);

  return apiRequest(`/tasks/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    token,
    body: payload,
  });
}

function isIdLike(value) {
  return (
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d+$/.test(value.trim()))
  );
}

function resolveStatusArguments(first, second, third) {
  if (TASK_STATUSES.has(second)) {
    return {
      id: first,
      status: second,
      token: third,
    };
  }

  if (TASK_STATUSES.has(third)) {
    return {
      token: first,
      id: second,
      status: third,
    };
  }

  if (isIdLike(first) && !isIdLike(second)) {
    return {
      id: first,
      status: second,
      token: third,
    };
  }

  return {
    token: first,
    id: second,
    status: third,
  };
}

function updateTaskStatus(first, second, third) {
  const { token, id, status } = resolveStatusArguments(first, second, third);

  return apiRequest(`/tasks/${encodeURIComponent(String(id))}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
}

function resolveDeleteArguments(first, second) {
  if (isIdLike(first) && !isIdLike(second)) {
    return {
      id: first,
      token: second,
    };
  }

  return {
    token: first,
    id: second,
  };
}

function deleteTask(first, second) {
  const { token, id } = resolveDeleteArguments(first, second);

  return apiRequest(`/tasks/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    token,
  });
}

export const taskApi = {
  list: listTasks,
  getAll: listTasks,
  getTasks: listTasks,
  listTasks,
  create: createTask,
  createTask,
  update: updateTask,
  updateTask,
  updateStatus: updateTaskStatus,
  updateTaskStatus,
  delete: deleteTask,
  deleteTask,
};

export default {
  request: apiRequest,
  authApi,
  taskApi,
};