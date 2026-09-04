# Taskmgmt REST API

Taskmgmt exposes a JSON REST API for authentication and user-scoped task management.

## Base URLs

- API routes: `http://localhost:4000/api`
- Health check: `http://localhost:4000/health`

The browser-facing API base URL is configured with `NEXT_PUBLIC_API_URL` and should include the `/api` suffix.

## Conventions

### Content type

Requests with a body must use:

```http
Content-Type: application/json
```

All non-empty responses are JSON.

### Authentication

All task endpoints and `GET /api/auth/me` require a JWT:

```http
Authorization: Bearer <token>
```

Tokens are returned by the signup and login endpoints. Token lifetime is controlled by `JWT_EXPIRES_IN`.

Missing, expired, malformed, or invalid tokens return `401 Unauthorized`.

### Error shape

Errors use the following shape:

```json
{
  "error": "Human-readable error message"
}
```

Validation and other known errors may include additional details:

```json
{
  "error": "Validation failed",
  "details": [
    "title is required"
  ]
}
```

The exact `error` message and optional `details` value depend on the failure. Production responses do not expose stack traces, database credentials, JWT secrets, or other internal details.

### Date and time values

Task date fields are returned as ISO 8601 timestamps or `null`:

```json
"2026-09-15T17:30:00.000Z"
```

Clients should submit `dueDate` as an ISO 8601 date-time, preferably with a UTC suffix or explicit offset. The API stores and compares due dates as absolute times.

### Task statuses

The supported task statuses are:

| Value | Meaning |
| --- | --- |
| `todo` | Work has not started |
| `in_progress` | Work is in progress |
| `done` | Work is complete |

Any other status is rejected with `400 Bad Request`.

## Resource shapes

### User

```json
{
  "id": 7,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "createdAt": "2026-09-01T10:15:00.000Z"
}
```

Passwords and password hashes are never returned.

### Authentication response

```json
{
  "token": "<jwt>",
  "user": {
    "id": 7,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "createdAt": "2026-09-01T10:15:00.000Z"
  }
}
```

### Task

```json
{
  "id": 42,
  "title": "Prepare release notes",
  "description": "Summarize the changes included in the next release.",
  "status": "in_progress",
  "dueDate": "2026-09-15T17:30:00.000Z",
  "dueNotifiedAt": null,
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-02T08:45:00.000Z"
}
```

`dueNotifiedAt` is server-managed and cannot be set directly through the API. It records when a due-task email was successfully sent. Changing a due date or reopening a completed task resets notification eligibility when required by the notification rules.

Tasks are always scoped to the authenticated user. A user cannot list, modify, or delete another user's tasks.

---

# Health

## `GET /health`

Checks whether the Express application is running.

**Authentication:** Not required.

### Success response

**Status:** `200 OK`

```json
{
  "status": "ok"
}
```

---

# Authentication

## `POST /api/auth/signup`

Creates a user account and returns a signed JWT.

**Authentication:** Not required.

### Request body

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "correct-horse-battery-staple"
}
```

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `name` | string | Yes | Must contain non-whitespace characters and fit within the supported user-name length |
| `email` | string | Yes | Must be a valid email address; normalized before storage |
| `password` | string | Yes | Must satisfy the minimum password-length requirement |

Unknown or server-managed fields are not accepted as substitutes for required fields.

### Success response

**Status:** `201 Created`

```json
{
  "token": "<jwt>",
  "user": {
    "id": 7,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "createdAt": "2026-09-01T10:15:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | Missing name, email, or password; invalid email; weak or otherwise invalid password; malformed JSON |
| `409 Conflict` | An account already exists for the normalized email address |
| `500 Internal Server Error` | Unexpected server or database failure |

Example validation response:

```json
{
  "error": "A valid email address is required"
}
```

Example duplicate-email response:

```json
{
  "error": "An account with this email already exists"
}
```

---

## `POST /api/auth/login`

Authenticates an existing user and returns a signed JWT.

**Authentication:** Not required.

### Request body

```json
{
  "email": "ada@example.com",
  "password": "correct-horse-battery-staple"
}
```

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `email` | string | Yes | Must be a valid email address; normalized before lookup |
| `password` | string | Yes | Must be non-empty |

### Success response

**Status:** `200 OK`

```json
{
  "token": "<jwt>",
  "user": {
    "id": 7,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "createdAt": "2026-09-01T10:15:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | Missing or malformed credentials; malformed JSON |
| `401 Unauthorized` | Email or password is incorrect |
| `500 Internal Server Error` | Unexpected server or database failure |

The login response does not reveal whether a particular email address is registered.

Example authentication failure:

```json
{
  "error": "Invalid email or password"
}
```

---

## `GET /api/auth/me`

Returns the user associated with the supplied JWT.

**Authentication:** Required.

### Request headers

```http
Authorization: Bearer <token>
```

### Success response

**Status:** `200 OK`

```json
{
  "user": {
    "id": 7,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "createdAt": "2026-09-01T10:15:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `401 Unauthorized` | Authorization header is missing, malformed, expired, or contains an invalid token |
| `404 Not Found` | The token is valid but its user no longer exists |
| `500 Internal Server Error` | Unexpected server or database failure |

---

# Tasks

Every endpoint in this section requires authentication. Task access is restricted by both task ID and the authenticated user ID.

## `GET /api/tasks`

Returns the authenticated user's tasks.

**Authentication:** Required.

### Query parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `status` | string | No | Filters results to `todo`, `in_progress`, or `done` |

Examples:

```http
GET /api/tasks
```

```http
GET /api/tasks?status=in_progress
```

### Success response

**Status:** `200 OK`

```json
{
  "tasks": [
    {
      "id": 42,
      "title": "Prepare release notes",
      "description": "Summarize the changes included in the next release.",
      "status": "in_progress",
      "dueDate": "2026-09-15T17:30:00.000Z",
      "dueNotifiedAt": null,
      "createdAt": "2026-09-01T12:00:00.000Z",
      "updatedAt": "2026-09-02T08:45:00.000Z"
    },
    {
      "id": 43,
      "title": "Archive completed documents",
      "description": "",
      "status": "done",
      "dueDate": null,
      "dueNotifiedAt": null,
      "createdAt": "2026-09-01T13:00:00.000Z",
      "updatedAt": "2026-09-01T16:00:00.000Z"
    }
  ]
}
```

If no tasks match, the endpoint returns:

```json
{
  "tasks": []
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | The `status` query value is unsupported |
| `401 Unauthorized` | Missing, malformed, expired, or invalid token |
| `500 Internal Server Error` | Unexpected server or database failure |

---

## `POST /api/tasks`

Creates a task owned by the authenticated user.

**Authentication:** Required.

### Request body

```json
{
  "title": "Prepare release notes",
  "description": "Summarize the changes included in the next release.",
  "status": "todo",
  "dueDate": "2026-09-15T17:30:00.000Z"
}
```

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `title` | string | Yes | Trimmed value must not be blank and must not exceed 255 characters |
| `description` | string | No | Defaults to an empty value and must not exceed 5,000 characters |
| `status` | string | No | Must be `todo`, `in_progress`, or `done`; defaults to `todo` |
| `dueDate` | string or `null` | No | Must be `null` or a valid date-time; defaults to `null` |

A due date may be in the past. If the task is incomplete, it becomes eligible for processing by the due-task notification job.

Client-supplied ownership, notification, ID, and timestamp fields are not used to assign ownership or override server-managed values.

### Success response

**Status:** `201 Created`

```json
{
  "task": {
    "id": 42,
    "title": "Prepare release notes",
    "description": "Summarize the changes included in the next release.",
    "status": "todo",
    "dueDate": "2026-09-15T17:30:00.000Z",
    "dueNotifiedAt": null,
    "createdAt": "2026-09-01T12:00:00.000Z",
    "updatedAt": "2026-09-01T12:00:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | Blank or oversized title; oversized or invalid description; unsupported status; invalid due date; malformed JSON |
| `401 Unauthorized` | Missing, malformed, expired, or invalid token |
| `500 Internal Server Error` | Unexpected server or database failure |

Example validation response:

```json
{
  "error": "Validation failed",
  "details": [
    "title must not be blank",
    "status must be one of: todo, in_progress, done"
  ]
}
```

---

## `PUT /api/tasks/:id`

Replaces the editable fields of one task owned by the authenticated user.

**Authentication:** Required.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | positive integer | ID of the task to update |

### Request body

Send the complete editable task state:

```json
{
  "title": "Prepare and publish release notes",
  "description": "Include migration instructions and known issues.",
  "status": "in_progress",
  "dueDate": "2026-09-16T17:30:00.000Z"
}
```

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `title` | string | Yes | Trimmed value must not be blank and must not exceed 255 characters |
| `description` | string | Yes | May be empty but must not exceed 5,000 characters |
| `status` | string | Yes | Must be `todo`, `in_progress`, or `done` |
| `dueDate` | string or `null` | Yes | Must be `null` or a valid date-time |

Changing the due date resets `dueNotifiedAt` so the updated due time can be considered by the notification job. Reopening a completed task may also reset notification eligibility.

### Success response

**Status:** `200 OK`

```json
{
  "task": {
    "id": 42,
    "title": "Prepare and publish release notes",
    "description": "Include migration instructions and known issues.",
    "status": "in_progress",
    "dueDate": "2026-09-16T17:30:00.000Z",
    "dueNotifiedAt": null,
    "createdAt": "2026-09-01T12:00:00.000Z",
    "updatedAt": "2026-09-02T09:15:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | Invalid task ID; missing or invalid editable fields; malformed JSON |
| `401 Unauthorized` | Missing, malformed, expired, or invalid token |
| `404 Not Found` | No task with that ID belongs to the authenticated user |
| `500 Internal Server Error` | Unexpected server or database failure |

Tasks owned by another user return `404 Not Found` rather than revealing that the task exists.

---

## `PATCH /api/tasks/:id/status`

Changes only the status of one task owned by the authenticated user. This endpoint is intended for lightweight status transitions such as kanban drag-and-drop operations.

**Authentication:** Required.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | positive integer | ID of the task whose status will change |

### Request body

```json
{
  "status": "done"
}
```

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `status` | string | Yes | Must be `todo`, `in_progress`, or `done` |

Reopening a task by changing its status from `done` to `todo` or `in_progress` resets due-notification eligibility when required.

### Success response

**Status:** `200 OK`

```json
{
  "task": {
    "id": 42,
    "title": "Prepare release notes",
    "description": "Summarize the changes included in the next release.",
    "status": "done",
    "dueDate": "2026-09-15T17:30:00.000Z",
    "dueNotifiedAt": null,
    "createdAt": "2026-09-01T12:00:00.000Z",
    "updatedAt": "2026-09-02T10:00:00.000Z"
  }
}
```

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | Invalid task ID; missing or unsupported status; malformed JSON |
| `401 Unauthorized` | Missing, malformed, expired, or invalid token |
| `404 Not Found` | No task with that ID belongs to the authenticated user |
| `500 Internal Server Error` | Unexpected server or database failure |

---

## `DELETE /api/tasks/:id`

Permanently deletes one task owned by the authenticated user.

**Authentication:** Required.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | positive integer | ID of the task to delete |

### Success response

**Status:** `204 No Content`

The response has no body.

### Failure responses

| Status | Cause |
| --- | --- |
| `400 Bad Request` | The task ID is not a positive integer |
| `401 Unauthorized` | Missing, malformed, expired, or invalid token |
| `404 Not Found` | No task with that ID belongs to the authenticated user |
| `500 Internal Server Error` | Unexpected server or database failure |

---

# Common responses

## `400 Bad Request`

Returned for malformed JSON, invalid path or query parameters, and request-body validation failures.

```json
{
  "error": "Validation failed",
  "details": [
    "dueDate must be null or a valid date-time"
  ]
}
```

## `401 Unauthorized`

Returned when authentication is required but no usable JWT is supplied.

```json
{
  "error": "Authentication required"
}
```

An expired or invalid token also returns `401`:

```json
{
  "error": "Invalid or expired token"
}
```

## `404 Not Found`

Returned for missing user-owned resources and unknown API routes.

Unknown route example:

```json
{
  "error": "Route not found"
}
```

## `409 Conflict`

Returned when a uniqueness constraint prevents the requested operation, such as registering an email address that is already in use.

```json
{
  "error": "An account with this email already exists"
}
```

## `500 Internal Server Error`

Returned for unexpected failures.

```json
{
  "error": "Internal server error"
}
```

Internal exception details and stack traces are not included in production responses.