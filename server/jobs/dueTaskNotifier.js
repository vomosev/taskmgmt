const cron = require('node-cron');
const { pool } = require('../config/db');
const { sendTaskDueEmail } = require('../services/emailService');

const DEFAULT_NOTIFICATION_CRON = '*/5 * * * *';

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runDueTaskNotifications() {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  const summary = {
    found: 0,
    sent: 0,
    failed: 0,
  };

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.execute(
      `SELECT
         t.id,
         t.title,
         t.description,
         t.status,
         t.due_date AS dueDate,
         u.email AS recipient,
         u.name AS userName
       FROM tasks AS t
       INNER JOIN users AS u ON u.id = t.user_id
       WHERE t.status <> 'done'
         AND t.due_date IS NOT NULL
         AND t.due_date <= UTC_TIMESTAMP()
         AND t.due_notified_at IS NULL
       ORDER BY t.due_date ASC, t.id ASC
       FOR UPDATE SKIP LOCKED`
    );

    summary.found = rows.length;

    for (const row of rows) {
      try {
        await sendTaskDueEmail({
          recipient: row.recipient,
          userName: row.userName,
          task: {
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status,
            dueDate: row.dueDate,
          },
        });

        const [result] = await connection.execute(
          `UPDATE tasks
           SET due_notified_at = UTC_TIMESTAMP()
           WHERE id = ?
             AND status <> 'done'
             AND due_date IS NOT NULL
             AND due_date <= UTC_TIMESTAMP()
             AND due_notified_at IS NULL`,
          [row.id]
        );

        if (result.affectedRows !== 1) {
          throw new Error('The notification could not be marked as sent');
        }

        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(
          `Failed to notify the owner of due task ${row.id}: ${getErrorMessage(error)}`
        );
      }
    }

    await connection.commit();
    transactionStarted = false;

    return summary;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          `Failed to roll back due-task notification transaction: ${getErrorMessage(
            rollbackError
          )}`
        );
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

function startDueTaskNotifier() {
  const schedule =
    process.env.DUE_NOTIFICATION_CRON?.trim() || DEFAULT_NOTIFICATION_CRON;

  if (!cron.validate(schedule)) {
    throw new Error('DUE_NOTIFICATION_CRON must be a valid cron expression');
  }

  let isRunning = false;

  return cron.schedule(schedule, async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      await runDueTaskNotifications();
    } catch (error) {
      console.error(
        `Due-task notification job failed: ${getErrorMessage(error)}`
      );
    } finally {
      isRunning = false;
    }
  });
}

module.exports = {
  runDueTaskNotifications,
  startDueTaskNotifier,
};