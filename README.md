# Taskmgmt

Taskmgmt is a full-stack task management application with JWT authentication, user-scoped task persistence, a responsive dashboard, a drag-and-drop Kanban board, and scheduled email notifications for due tasks.

## Features

- Account registration, login, session restoration, and logout
- JWT-protected REST API
- User-scoped task data
- Dashboard task counts by status
- Kanban workflow with `todo`, `in_progress`, and `done` columns
- Pointer and keyboard-accessible drag-and-drop
- Task creation, editing, deletion, and status updates
- Optional task descriptions and due dates
- Overdue task highlighting
- Scheduled due-task email notifications
- Responsive layouts and accessible dialogs, forms, and controls
- MySQL persistence with indexed dashboard and notification queries
- Docker-based local deployment
- Vitest and Supertest coverage
- GitHub Actions continuous integration

## Architecture

Taskmgmt runs as two Node.js processes backed by MySQL:

- **Frontend:** Next.js App Router on port `3000`
- **Backend:** Express REST API on port `4000` by default
- **Database:** MySQL on port `3306`
- **Notifications:** A `node-cron` job running within the backend process
- **Email:** Nodemailer using a configured SMTP server

The frontend calls the API URL configured through `NEXT_PUBLIC_API_URL`. Authentication tokens are issued by Express and persisted by the browser client. Every task query and mutation is scoped to the authenticated user ID.

```text
Browser
  │
  ├── Next.js frontend (:3000)
  │       │
  │       └── Authenticated REST requests
  │
  └──── Express API (:4000)
             ├── MySQL
             └── Scheduled SMTP notifications
```

## Prerequisites

For a local installation:

- Node.js 20.x
- npm
- MySQL 8.x
- Access to an SMTP server if due-task emails should be delivered

For a containerized installation:

- Docker
- Docker Compose

## Environment Setup

Copy the provided environment template:

```bash
cp .env.example .env
```

Update `.env` for your environment before starting the application.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime mode, normally `development`, `test`, or `production` |
| `PORT` | Express API listening port |
| `FRONTEND_URL` | Frontend origin allowed by the API CORS configuration |
| `NEXT_PUBLIC_API_URL` | Browser-accessible API base URL, including `/api` |
| `DB_HOST` | MySQL hostname |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL application user |
| `DB_PASSWORD` | MySQL application-user password |
| `DB_NAME` | MySQL database name |
| `MYSQL_ROOT_PASSWORD` | MySQL root password used by Docker initialization |
| `JWT_SECRET` | Secret used to sign and verify JWTs |
| `JWT_EXPIRES_IN` | JWT lifetime accepted by `jsonwebtoken`, such as a duration expression |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `SMTP_SECURE` | `true` for implicit TLS, commonly on port 465; otherwise `false` |
| `SMTP_USER` | SMTP authentication username |
| `SMTP_PASSWORD` | SMTP password or application token |
| `SMTP_FROM` | Sender name and address for task notification emails |
| `DUE_NOTIFICATION_CRON` | Cron expression controlling notification checks |

For local development, the usual browser-accessible values are:

- `FRONTEND_URL` pointing to the frontend on port `3000`
- `NEXT_PUBLIC_API_URL` pointing to the API on port `4000` with `/api`
- `DB_HOST` pointing to the local MySQL server

Use a long, random `JWT_SECRET` in every deployed environment. Do not commit `.env` or production credentials.

`NEXT_PUBLIC_API_URL` is exposed to browser code and is embedded in the frontend during the Next.js build. If it changes, rebuild the frontend or Docker image.

## Local Installation

Install dependencies:

```bash
npm install
```

If a lockfile is present and an exact reproducible installation is preferred:

```bash
npm ci
```

Configure `.env`, initialize MySQL, and then start the development processes:

```bash
npm run dev
```

The application is then available through the configured ports:

- Frontend: `http://localhost:3000`
- API health check: `http://localhost:4000/health`
- API base: `http://localhost:4000/api`

Verify the backend:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{"status":"ok"}
```

## MySQL Schema Initialization

The `schema.sql` file creates the application tables, constraints, foreign keys, and indexes. It includes:

- A `users` table with unique normalized email addresses and hashed passwords
- A `tasks` table owned by users
- Task title, description, status, due date, and notification timestamp fields
- Cascading deletion of a user's tasks
- Status constraints
- Indexes for user dashboards and due-notification scans

Create the database and provision an application user with permissions for that database using your normal MySQL administration process. Then import the schema into the configured database:

```bash
mysql -h 127.0.0.1 -P 3306 -u taskmgmt -p taskmgmt < schema.sql
```

Replace the host, port, user, and database arguments with the values selected for your environment. The command prompts for the database user's password rather than placing it in shell history.

The configured application user requires permission to read and modify the tables and to use transactions.

### Reinitializing a Local Database

Dropping or recreating the database permanently deletes all users and tasks. After recreating the database, import `schema.sql` again before starting the API.

## SMTP Configuration

Due-task notifications are delivered through Nodemailer. Configure the SMTP variables using the values supplied by your email provider:

- Set `SMTP_HOST` and `SMTP_PORT`.
- Set `SMTP_SECURE=true` when the provider requires implicit TLS, usually on port 465.
- Set `SMTP_SECURE=false` when the provider uses STARTTLS, commonly on port 587.
- Set `SMTP_USER` and `SMTP_PASSWORD` to the provider-issued credentials.
- Set `SMTP_FROM` to an address authorized by the provider.
- Set `FRONTEND_URL` to the public dashboard origin so email links direct users to the correct application.

For production, prefer an application-specific SMTP token instead of a primary account password. Ensure the sender domain and address satisfy the provider's verification requirements.

## Due-Task Notification Behavior

The backend starts a scheduled notification worker using `DUE_NOTIFICATION_CRON`.

On each run, the worker finds tasks that:

- Are not completed
- Have a due date at or before the current time
- Have not already been successfully notified

The job sends each task owner a plain-text and HTML email. Successful deliveries update the task's notification timestamp so the same due event is not repeatedly emailed. Failures are isolated per message so one SMTP error does not prevent other notifications from being processed.

A task becomes eligible for a new notification when its due date changes. Reopening a completed task also resets notification state where required by the task rules.

The scheduler only runs while the Express backend process is running. Server and database clocks should be synchronized, and production cron expressions should be selected with the server's configured timezone in mind.

## Docker

Docker Compose starts the application and a health-checked MySQL service. MySQL data is stored in a named volume, and `schema.sql` is applied automatically when a new database volume is initialized.

Copy and configure the environment file first:

```bash
cp .env.example .env
```

For Docker networking, MySQL must be addressed by the database service hostname configured in `docker-compose.yml`. The value of `NEXT_PUBLIC_API_URL` must remain reachable by the user's browser; do not use an internal Compose hostname for that browser-facing URL.

Build and start the stack:

```bash
docker compose up --build
```

Start in the background:

```bash
docker compose up --build -d
```

Inspect service logs:

```bash
docker compose logs -f app mysql
```

Stop the services while preserving database data:

```bash
docker compose down
```

Stop the services and permanently remove the MySQL data volume:

```bash
docker compose down -v
```

Removing the volume causes `schema.sql` to run again the next time MySQL initializes. This is destructive and deletes all existing application data.

If `NEXT_PUBLIC_API_URL` changes, rebuild the application image because public Next.js variables are embedded at build time:

```bash
docker compose build --no-cache app
docker compose up -d
```

## Testing

Run the Vitest suite:

```bash
npm test
```

The tests cover:

- Task input normalization
- Blank and oversized title rejection
- Invalid status and due-date rejection
- Partial-update behavior
- Overdue calculations
- Completed and null-due-date cases
- API health responses
- JSON responses for unknown routes

The HTTP tests import the Express application without opening a network port.

## Production Build

Set production environment values before building. In particular, ensure `NEXT_PUBLIC_API_URL` is the public URL that browsers will use.

Build the Next.js frontend:

```bash
npm run build
```

Start the production frontend and backend processes:

```bash
NODE_ENV=production npm start
```

The backend validates its MySQL connection during startup and starts the due-task scheduler after initialization. It also handles termination signals so the HTTP server, scheduler, and database pool can shut down cleanly.

For a public deployment:

- Use HTTPS.
- Put the frontend and API behind a production reverse proxy or load balancer.
- Restrict CORS with the exact production `FRONTEND_URL`.
- Use strong database and JWT credentials.
- Keep MySQL and SMTP credentials outside source control.
- Persist and back up the MySQL data directory.
- Configure process supervision and restart policies.
- Monitor scheduler and SMTP failures.
- Rebuild when browser-exposed environment values change.

## API Documentation

Complete REST API documentation is available in [`API.md`](API.md).

The main routes are:

- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `PATCH /api/tasks/:id/status`
- `DELETE /api/tasks/:id`

Task routes and the current-user route require an `Authorization` header:

```text
Authorization: Bearer <token>
```

See `API.md` for request bodies, query parameters, response shapes, validation rules, and error status codes.

## Project Structure

```text
.
├── .dockerignore
├── .env.example
├── .github
│   └── workflows
│       └── ci.yml
├── .gitignore
├── API.md
├── Dockerfile
├── README.md
├── app
│   ├── dashboard
│   │   └── page.jsx
│   ├── globals.css
│   ├── layout.jsx
│   ├── login
│   │   └── page.jsx
│   ├── page.jsx
│   └── signup
│       └── page.jsx
├── components
│   ├── AuthForm.jsx
│   ├── Dashboard.jsx
│   ├── KanbanBoard.jsx
│   ├── TaskCard.jsx
│   ├── TaskColumn.jsx
│   └── TaskModal.jsx
├── contexts
│   └── AuthContext.jsx
├── docker-compose.yml
├── lib
│   └── api.js
├── next.config.js
├── package.json
├── schema.sql
└── server
    ├── app.js
    ├── config
    │   └── db.js
    ├── controllers
    │   ├── authController.js
    │   └── taskController.js
    ├── index.js
    ├── jobs
    │   └── dueTaskNotifier.js
    ├── middleware
    │   ├── auth.js
    │   └── errorHandler.js
    ├── routes
    │   ├── authRoutes.js
    │   └── taskRoutes.js
    ├── services
    │   ├── emailService.js
    │   └── taskService.js
    ├── tests
    │   ├── health.test.js
    │   └── taskRules.test.js
    └── utils
        └── taskRules.js
```

### Key Files

- `app/` contains the Next.js App Router pages and global styles.
- `components/` contains authentication, dashboard, Kanban, card, column, and modal UI components.
- `contexts/AuthContext.jsx` manages browser authentication state and JWT persistence.
- `lib/api.js` provides the frontend API client.
- `server/app.js` configures Express without opening a port, allowing isolated tests.
- `server/index.js` manages backend startup and graceful shutdown.
- `server/controllers/` validates HTTP input and produces REST responses.
- `server/services/` contains task persistence and email delivery logic.
- `server/jobs/dueTaskNotifier.js` implements scheduled due-task processing.
- `server/utils/taskRules.js` contains shared task validation and overdue rules.
- `schema.sql` defines the MySQL schema.
- `docker-compose.yml` runs the application and MySQL locally.
- `API.md` documents the REST API.
- `.github/workflows/ci.yml` runs tests and verifies the production frontend build.