import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { testConnection, closePool } from './config/db';
import { startDueTaskNotifier } from './jobs/dueTaskNotifier';

const DEFAULT_PORT = 4000;
const SHUTDOWN_TIMEOUT_MS = 10000;

let httpServer = null;
let notificationScheduler = null;
let isShuttingDown = false;

function getPort() {
  const rawPort = process.env.PORT || String(DEFAULT_PORT);
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    httpServer = server;

    const handleListening = () => {
      server.removeListener('error', handleError);
      resolve(server);
    };

    const handleError = (error) => {
      server.removeListener('listening', handleListening);
      reject(error);
    };

    server.once('listening', handleListening);
    server.once('error', handleError);
  });
}

function closeHttpServer() {
  if (!httpServer || !httpServer.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    if (typeof httpServer.closeIdleConnections === 'function') {
      httpServer.closeIdleConnections();
    }
  });
}

async function stopNotificationScheduler() {
  if (!notificationScheduler) {
    return;
  }

  if (typeof notificationScheduler.stop === 'function') {
    await Promise.resolve(notificationScheduler.stop());
  }

  notificationScheduler = null;
}

async function shutdown(reason, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Shutting down Taskmgmt API (${reason})...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing process exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  let finalExitCode = exitCode;

  try {
    await stopNotificationScheduler();
  } catch (error) {
    finalExitCode = 1;
    console.error('Failed to stop the due-task notification scheduler:', error);
  }

  try {
    await closeHttpServer();
  } catch (error) {
    finalExitCode = 1;
    console.error('Failed to close the HTTP server:', error);
  }

  try {
    await closePool();
  } catch (error) {
    finalExitCode = 1;
    console.error('Failed to close the MySQL connection pool:', error);
  }

  clearTimeout(forceExitTimer);
  process.exit(finalExitCode);
}

async function start() {
  const port = getPort();

  await testConnection();
  console.log('MySQL connection verified.');

  await listen(port);
  console.log(`Taskmgmt API listening on port ${port}.`);

  notificationScheduler = await Promise.resolve(startDueTaskNotifier());
  console.log('Due-task notification scheduler started.');
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void shutdown('uncaught exception', 1);
});

process.once('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  void shutdown('unhandled promise rejection', 1);
});

start().catch((error) => {
  console.error('Unable to start Taskmgmt API:', error);
  void shutdown('startup failure', 1);
});
