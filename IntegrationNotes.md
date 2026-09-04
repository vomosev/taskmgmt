# Integration Notes for taskmgmt

## Overview

Taskmgmt is a full-stack task management application with:

- JWT-based signup, login, and authenticated user sessions
- User-scoped task persistence in MySQL
- A responsive Next.js dashboard
- Drag-and-drop kanban columns for `todo`, `in-progress`, and `done` tasks
- Task creation, editing, status updates, and deletion
- Due-date and overdue tracking
- Scheduled due-task email notifications through SMTP
- Vitest and Supertest coverage
- Docker Compose support for the application and MySQL
- GitHub Actions CI for tests and production builds

The frontend uses the Next.js App Router and is served on port `3000` by default. The Express REST API is served on `PORT`, normally `4000`, with API routes under `/api`. The frontend communicates with the API through `NEXT_PUBLIC_API_URL`.

API behavior, request bodies, authentication requirements, response shapes, and status codes are documented in [`API.md`](API.md).

## Prerequisites

For a local installation, install:

- Node.js 20
- npm compatible with Node.js 20
- MySQL, with a server reachable from the application
- An SMTP account if due-task email notifications are required

For container-based deployment, install:

- Docker
- Docker Compose v2, available through the `docker compose` command

The following ports should be available for the default configuration:

- `3000`: Next.js frontend
- `4000`: Express API
- `3306`: MySQL, when exposed through Docker Compose

## Installation

### Install Node.js dependencies

From the repository root:

```bash
npm ci
```

Use `npm install` instead if intentionally updating dependencies or generating a new lockfile:

```bash
npm install
```

The frontend and backend share the root [`package.json`](package.json); no separate installation is required under `app/` or `server/`.

### Create the environment file

Copy the supplied template:

```bash
cp .env.example .env
```

Replace all placeholder passwords and secrets in `.env`. In particular, use strong values for:

- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`
- `SMTP_PASSWORD`

Generate a JWT secret with a cryptographically secure command such as:

```bash
openssl rand -base64 48
```

The default local URL relationship should be:

```dotenv
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000/api
PORT=4000
```

`NEXT_PUBLIC_API_URL` is exposed to browser code. It must be reachable from the user's browser, not merely from the backend container or host network.

### Prepare MySQL for local development

Create the database and application user before loading the schema. For example, connect as a MySQL administrator:

```bash
mysql -u root -p
```

Then create the database and grant access, substituting a strong password matching `DB_PASSWORD`:

```sql
CREATE DATABASE taskmgmt
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'taskmgmt'@'localhost'
  IDENTIFIED BY 'replace-with-a-strong-password';

GRANT ALL PRIVILEGES ON taskmgmt.* TO 'taskmgmt'@'localhost';
FLUSH PRIVILEGES;
```

Load [`schema.sql`](schema.sql):

```bash
mysql \
  -h localhost \
  -P 3306 \
  -u taskmgmt \
  -p \
  taskmgmt < schema.sql
```

If `DB_HOST`, `DB_PORT`, `DB_USER`, or `DB_NAME` differs, use those values in the command.

The schema creates the application `users` and `tasks` tables, ownership constraints, status constraints, timestamps, notification tracking, and indexes used by dashboards and due-task notification queries.

### Docker-based installation

Ensure `.env` contains values suitable for Docker Compose. The database hostname used by the application service should match the MySQL service name from [`docker-compose.yml`](docker-compose.yml), rather than `localhost`. Review the Compose file for the exact service name and set `DB_HOST` accordingly.

Build and start both services:

```bash
docker compose up --build
```

Docker Compose:

- Builds the combined frontend and backend image from [`Dockerfile`](Dockerfile)
- Starts the MySQL service with a health check
- Waits for MySQL before starting the application
- Initializes a new MySQL data volume from [`schema.sql`](schema.sql)
- Exposes the frontend, API, and database ports
- Persists MySQL data in a named volume

MySQL initialization scripts run only when the database volume is first created. To discard all local database data and rerun initialization:

```bash
docker compose down -v
docker compose up --build
```

The `-v` operation permanently removes the Compose-managed database volume.

## Environment Variables

All variables are represented in [`.env.example`](.env.example) and should be configured in `.env` or through the deployment platform.

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment used to select development or production behavior. It affects items such as production-safe error output and CORS behavior. | `development` |
| `PORT` | Port on which the Express API server listens. | `4000` |
| `FRONTEND_URL` | Allowed frontend origin used by the Express CORS configuration. Include the protocol and port, without an unnecessary path. | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Browser-accessible base URL for the REST API, including the `/api` prefix. This value is exposed to frontend code and is embedded during a Next.js production build. | `http://localhost:4000/api` |
| `DB_HOST` | Hostname of the MySQL server. Use `localhost` for a host-installed database or the MySQL Compose service name when running inside Docker. | `localhost` |
| `DB_PORT` | Port of the MySQL server. | `3306` |
| `DB_USER` | MySQL application user with access to the Taskmgmt database. | `taskmgmt` |
| `DB_PASSWORD` | Password for the MySQL application user. Do not commit the real value. | `replace-with-a-strong-password` |
| `DB_NAME` | MySQL database containing the application tables. | `taskmgmt` |
| `MYSQL_ROOT_PASSWORD` | Root password used to initialize the MySQL Docker service. This is primarily consumed by Docker Compose and the MySQL image. | `replace-with-a-strong-root-password` |
| `JWT_SECRET` | Long random secret used to sign and verify authentication tokens. Changing it invalidates existing tokens. | `replace-with-a-long-random-secret` |
| `JWT_EXPIRES_IN` | `jsonwebtoken` duration expression controlling authentication token lifetime. | `7d` |
| `SMTP_HOST` | Hostname of the SMTP server used for due-task email notifications. | `smtp.example.com` |
| `SMTP_PORT` | Port of the SMTP server. Common values are `587` for STARTTLS and `465` for implicit TLS. | `587` |
| `SMTP_SECURE` | Whether Nodemailer should use an implicit TLS SMTP connection. Use `true` commonly with port `465`; use `false` commonly with port `587`. | `false` |
| `SMTP_USER` | Username for SMTP authentication. | `notifications@example.com` |
| `SMTP_PASSWORD` | Password or application token for SMTP authentication. | `replace-with-smtp-password` |
| `SMTP_FROM` | Sender name and address placed on due-task notification emails. | `Taskmgmt <notifications@example.com>` |
| `DUE_NOTIFICATION_CRON` | Cron expression controlling how often the due-task notification job runs. The example runs every five minutes. | `*/5 * * * *` |

### Environment-specific notes

- Never commit `.env`; local environment files are excluded by [`.gitignore`](.gitignore).
- Keep `JWT_SECRET`, database passwords, SMTP credentials, and the MySQL root password in a production secret manager.
- `NEXT_PUBLIC_API_URL` is not secret. Any variable prefixed with `NEXT_PUBLIC_` is available to browser code.
- Set `NEXT_PUBLIC_API_URL` before running `npm run build`, because Next.js can embed it in the generated frontend assets.
- `FRONTEND_URL` must exactly match the browser origin allowed by CORS, including `http` versus `https` and any nonstandard port.
- The SMTP account must permit the configured sender in `SMTP_FROM`. Some providers require an application password or verified sender identity.
- Invalid SMTP configuration does not prevent task storage, but scheduled notification attempts will fail and be logged.

## Running the Application

### Development mode

Ensure MySQL is running and the schema has been loaded, then start the application from the repository root:

```bash
npm run dev
```

The root development script uses the combined project configuration to run the Next.js frontend and Express backend together.

Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- API health check: [http://localhost:4000/health](http://localhost:4000/health)

Verify the backend manually:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{"status":"ok"}
```

Authentication and task requests are made under the `/api` prefix, for example:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `PATCH /api/tasks/:id/status`
- `DELETE /api/tasks/:id`

Protected endpoints require:

```http
Authorization: Bearer <jwt>
```

### Production build and local production run

Build the Next.js application:

```bash
npm run build
```

Start the production processes:

```bash
NODE_ENV=production npm start
```

Ensure production environment variables are present before both commands. In particular, configure `NEXT_PUBLIC_API_URL` before the build.

### Docker Compose

Start the complete stack in the foreground:

```bash
docker compose up --build
```

Start it in the background:

```bash
docker compose up --build -d
```

View logs:

```bash
docker compose logs -f
```

Stop the services while preserving database data:

```bash
docker compose down
```

After changing `NEXT_PUBLIC_API_URL`, rebuild the image so the frontend receives the updated public API URL:

```bash
docker compose build --no-cache
docker compose up -d
```

### Run tests

Execute the Vitest suite:

```bash
npm test
```

The tests include:

- Validation and normalization tests in [`server/tests/taskRules.test.js`](server/tests/taskRules.test.js)
- Express health and JSON 404 response tests in [`server/tests/health.test.js`](server/tests/health.test.js)

The health tests use Supertest against the exported Express app in [`server/app.js`](server/app.js), so they do not need to open an external HTTP port.

### Notification scheduler behavior

The scheduler starts with the Express server through [`server/index.js`](server/index.js). Its frequency is controlled by `DUE_NOTIFICATION_CRON`.

The job in [`server/jobs/dueTaskNotifier.js`](server/jobs/dueTaskNotifier.js):

1. Finds incomplete tasks whose due time has passed.
2. Limits processing to tasks whose `due_notified_at` value is still null.
3. Sends each owner an email through [`server/services/emailService.js`](server/services/emailService.js).
4. Marks successful notifications to avoid repeated delivery.
5. Isolates individual message failures so one failed email does not stop the entire run.

Changing a task's due date resets its notification state. Reopening a completed task also allows the due-notification rules to be evaluated again.

## Project Structure

### Root configuration and documentation

- [`package.json`](package.json): Defines the Node.js 20 project, shared dependencies, development scripts, production build/start scripts, and Vitest test command.
- [`next.config.js`](next.config.js): Next.js App Router configuration with React strict mode and production-safe defaults.
- [`.env.example`](.env.example): Safe template for all application, database, JWT, SMTP, Docker, URL, and scheduler variables.
- [`.gitignore`](.gitignore): Excludes dependencies, builds, coverage, local environment files, logs, and editor or operating-system artifacts.
- [`.dockerignore`](.dockerignore): Reduces the Docker build context by excluding local dependencies, generated output, Git metadata, environment files, coverage, and logs.
- [`README.md`](README.md): General feature, setup, operation, testing, deployment, and architecture documentation.
- [`API.md`](API.md): Complete REST API reference.
- [`schema.sql`](schema.sql): MySQL tables, constraints, foreign keys, timestamps, and query indexes.

### Next.js frontend

- [`app/layout.jsx`](app/layout.jsx): Root layout, metadata, global CSS import, and shared `AuthProvider`.
- [`app/page.jsx`](app/page.jsx): Public landing page with login and signup navigation.
- [`app/login/page.jsx`](app/login/page.jsx): Login route using the shared authentication form.
- [`app/signup/page.jsx`](app/signup/page.jsx): Account registration route.
- [`app/dashboard/page.jsx`](app/dashboard/page.jsx): Authenticated dashboard route.
- [`app/globals.css`](app/globals.css): Responsive styles for forms, dashboard summaries, kanban columns, cards, dialogs, loading states, errors, and accessibility indicators.

### Frontend authentication and API access

- [`contexts/AuthContext.jsx`](contexts/AuthContext.jsx): Persists the JWT in `localStorage`, restores the current user through `/auth/me`, and exposes login, signup, and logout actions.
- [`lib/api.js`](lib/api.js): Fetch-based API client that attaches bearer tokens and normalizes JSON API errors.
- [`components/AuthForm.jsx`](components/AuthForm.jsx): Reusable login and signup form with validation and redirect behavior.

### Dashboard and kanban components

- [`components/Dashboard.jsx`](components/Dashboard.jsx): Authenticated dashboard state, task loading, summary counts, mutations, logout, and modal coordination.
- [`components/KanbanBoard.jsx`](components/KanbanBoard.jsx): Drag-and-drop context, pointer and keyboard sensors, and task status transitions.
- [`components/TaskColumn.jsx`](components/TaskColumn.jsx): Droppable status column with task counts and empty states.
- [`components/TaskCard.jsx`](components/TaskCard.jsx): Accessible draggable task presentation, due-date formatting, overdue state, and edit/delete controls.
- [`components/TaskModal.jsx`](components/TaskModal.jsx): Accessible create/edit dialog with controlled task fields, validation, progress, API errors, and Escape handling.

### Express backend

- [`server/index.js`](server/index.js): Process entry point that loads environment variables, checks MySQL, starts HTTP and scheduling, and handles graceful shutdown.
- [`server/app.js`](server/app.js): Express application, JSON parsing, CORS, health route, API routers, 404 handling, and centralized errors.
- [`server/config/db.js`](server/config/db.js): `mysql2` promise pool and connection lifecycle helpers.
- [`server/middleware/auth.js`](server/middleware/auth.js): Bearer-token verification and authenticated request identity.
- [`server/middleware/errorHandler.js`](server/middleware/errorHandler.js): Safe centralized error mapping and JSON responses.
- [`server/routes/authRoutes.js`](server/routes/authRoutes.js): Signup, login, and current-user routes.
- [`server/routes/taskRoutes.js`](server/routes/taskRoutes.js): Protected task CRUD and status routes.
- [`server/controllers/authController.js`](server/controllers/authController.js): Input validation, password hashing, credential verification, JWT issuance, and safe user responses.
- [`server/controllers/taskController.js`](server/controllers/taskController.js): HTTP validation and user-scoped task request handling.
- [`server/services/taskService.js`](server/services/taskService.js): MySQL task persistence, ownership enforcement, row mapping, and notification-state reset rules.
- [`server/services/emailService.js`](server/services/emailService.js): Reusable Nodemailer transport and due-task email generation.
- [`server/jobs/dueTaskNotifier.js`](server/jobs/dueTaskNotifier.js): Scheduled due-task selection, delivery, marking, failure isolation, and scheduler lifecycle.
- [`server/utils/taskRules.js`](server/utils/taskRules.js): Pure task validation, normalization, supported statuses, and overdue calculations.
- [`server/tests/`](server/tests/): Vitest and Supertest test suite.

### Containerization and CI

- [`Dockerfile`](Dockerfile): Node.js 20 image that builds the frontend, includes the Express backend, exposes ports `3000` and `4000`, and starts both production processes.
- [`docker-compose.yml`](docker-compose.yml): Application and health-checked MySQL services, environment injection, schema initialization, networking, exposed ports, and persistent database storage.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml): Node.js 20 CI workflow that runs `npm ci`, executes Vitest, and verifies the Next.js production build on pushes and pull requests.

## Next Steps / Production Considerations

1. **Use production secrets**
   - Store JWT, database, root database, and SMTP credentials in a managed secret store.
   - Do not deploy `.env` as part of the image or commit it to source control.
   - Use a long, randomly generated `JWT_SECRET`.

2. **Deploy frontend and API URLs consistently**
   - Set `FRONTEND_URL` to the exact public frontend origin.
   - Set `NEXT_PUBLIC_API_URL` to the public HTTPS API URL including `/api`.
   - Rebuild the Next.js frontend whenever `NEXT_PUBLIC_API_URL` changes.

3. **Enable HTTPS**
   - Terminate TLS at a reverse proxy, ingress controller, or managed load balancer.
   - Redirect HTTP traffic to HTTPS.
   - Ensure both frontend and API URLs use HTTPS to prevent token exposure in transit.

4. **Review browser token storage**
   - The current frontend persists JWTs in `localStorage`.
   - Apply a strict Content Security Policy and prevent cross-site scripting.
   - For higher-security deployments, consider migrating authentication to secure, `HttpOnly`, `SameSite` cookies with CSRF protection.

5. **Harden the API**
   - Add request rate limiting, especially to signup and login routes.
   - Add security headers through middleware such as Helmet.
   - Apply request body size limits appropriate for task content.
   - Keep validation rules in [`server/utils/taskRules.js`](server/utils/taskRules.js) synchronized with API documentation and frontend validation.

6. **Secure MySQL**
   - Do not expose port `3306` publicly unless operationally required.
   - Use a least-privilege application database account rather than the root account.
   - Enable encrypted database connections where supported.
   - Configure automated backups and regularly test restoration.

7. **Plan schema migrations**
   - [`schema.sql`](schema.sql) is suitable for initial database creation.
   - Introduce a versioned migration tool before making production schema changes.
   - Do not delete a production Docker volume to apply schema updates.

8. **Make scheduled jobs deployment-safe**
   - Every running API instance starts the due-task scheduler. In a horizontally scaled deployment, consider running notifications in one dedicated worker.
   - Preserve the atomic claim/mark behavior in [`server/jobs/dueTaskNotifier.js`](server/jobs/dueTaskNotifier.js) to prevent duplicate notifications.
   - Add retry and dead-letter behavior if guaranteed email delivery is required.

9. **Configure SMTP deliverability**
   - Verify `SMTP_FROM` with the mail provider.
   - Configure SPF, DKIM, and DMARC for the sending domain.
   - Monitor rejected messages, authentication failures, and provider rate limits.

10. **Add observability**
    - Send application and scheduler logs to centralized logging.
    - Add health and readiness checks that distinguish process availability from database connectivity.
    - Monitor API latency, database errors, authentication failures, scheduler runs, and email delivery failures.
    - Avoid logging JWTs, passwords, SMTP credentials, or sensitive task content.

11. **Expand testing**
    - Add authenticated integration tests for every endpoint documented in [`API.md`](API.md).
    - Test user isolation to verify one account cannot read or modify another account's tasks.
    - Add database-backed tests for due-notification claiming and reset behavior.
    - Add frontend component and end-to-end tests for authentication, task CRUD, and drag-and-drop status changes.

12. **Keep CI as a deployment gate**
    - Require [`.github/workflows/ci.yml`](.github/workflows/ci.yml) to pass before merging.
    - Add dependency auditing, linting, container scanning, and migration validation as the project matures.
    - Use `npm ci` in CI and production image builds for reproducible dependency installation.

## Database Provisioning

A mysql database has been automatically provisioned for this app.

- **Database:** taskmgmt
- **Host:** testdb.gridiron-app.com
- **Port:** 3306
- **User:** victorgridirontestcom
- **Credentials stored in Vault at:** `secret/data/mysql/taskmgmt`

Retrieve the password securely from Vault and set it as an environment variable (e.g. `DB_PASSWORD`) in your deployment settings — do not commit it to source control.
