'use strict';

const nodemailer = require('nodemailer');

let transporter;

function parseSmtpPort(value) {
  const port = value ? Number(value) : 587;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error('SMTP_SECURE must be a boolean value.');
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = String(process.env.SMTP_HOST || '').trim();

  if (!host) {
    throw new Error('SMTP_HOST is required to send due-task notifications.');
  }

  const port = parseSmtpPort(process.env.SMTP_PORT);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASSWORD || '');

  if ((user && !password) || (!user && password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be provided together.');
  }

  const configuration = {
    host,
    port,
    secure
  };

  if (user && password) {
    configuration.auth = {
      user,
      pass: password
    };
  }

  transporter = nodemailer.createTransport(configuration);
  return transporter;
}

function sanitizePlainText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function sanitizeHeaderText(value) {
  return sanitizePlainText(value).replace(/\s*\n+\s*/g, ' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHtmlText(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function getDashboardUrl() {
  const frontendUrl = String(
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ).trim();

  let dashboardUrl;

  try {
    dashboardUrl = new URL('/dashboard', frontendUrl);
  } catch {
    throw new Error('FRONTEND_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(dashboardUrl.protocol)) {
    throw new Error('FRONTEND_URL must use the http or https protocol.');
  }

  return dashboardUrl.toString();
}

function formatDueDate(value) {
  const dueDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('The task due date is invalid.');
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(dueDate);
}

function validateRecipient(recipient) {
  const normalized = String(recipient || '').trim();

  if (
    !normalized ||
    /[\r\n]/.test(normalized) ||
    !/^[^\s<>,;@"()]+@[^\s<>,;@"()]+\.[^\s<>,;@"()]+$/.test(normalized)
  ) {
    throw new Error('A valid recipient email address is required.');
  }

  return normalized;
}

async function sendTaskDueEmail({ recipient, userName, task } = {}) {
  if (!task || typeof task !== 'object') {
    throw new Error('A task is required to send a due-task notification.');
  }

  const to = validateRecipient(recipient);
  const from = String(process.env.SMTP_FROM || '').trim();

  if (!from || /[\r\n]/.test(from)) {
    throw new Error('SMTP_FROM is required and must be a valid mail header.');
  }

  const title = sanitizePlainText(task.title);

  if (!title) {
    throw new Error('The task title is required.');
  }

  const name = sanitizePlainText(userName) || 'there';
  const description = sanitizePlainText(task.description);
  const dueValue = task.dueDate ?? task.due_date;

  if (dueValue === undefined || dueValue === null || dueValue === '') {
    throw new Error('The task due date is required.');
  }

  const dueDate = formatDueDate(dueValue);
  const dashboardUrl = getDashboardUrl();
  const subject = sanitizeHeaderText(`Task due: ${title}`);

  const descriptionText = description
    ? `\nDescription:\n${description}\n`
    : '';

  const text = [
    `Hello ${name},`,
    '',
    'This is a reminder that the following task is now due.',
    '',
    `Task: ${title}`,
    `Due: ${dueDate}`,
    descriptionText.trimEnd(),
    '',
    `Open your dashboard: ${dashboardUrl}`,
    '',
    '— Taskmgmt'
  ]
    .filter((line, index, lines) => {
      return line !== '' || index === 0 || lines[index - 1] !== '';
    })
    .join('\n');

  const descriptionHtml = description
    ? `
      <div style="margin-top:20px;">
        <div style="margin-bottom:6px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Description</div>
        <div style="color:#334155;font-size:15px;line-height:1.65;">${formatHtmlText(description)}</div>
      </div>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
                <div style="font-size:20px;font-weight:700;">Taskmgmt</div>
                <div style="margin-top:4px;color:#cbd5e1;font-size:14px;">Task due notification</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hello ${escapeHtml(name)},</p>
                <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.6;">
                  This is a reminder that the following task is now due.
                </p>
                <div style="padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                  <div style="margin-bottom:8px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Task</div>
                  <div style="font-size:20px;font-weight:700;line-height:1.4;">${escapeHtml(title)}</div>
                  <div style="margin-top:14px;color:#475569;font-size:14px;">
                    <strong style="color:#0f172a;">Due:</strong> ${escapeHtml(dueDate)}
                  </div>
                  ${descriptionHtml}
                </div>
                <div style="margin-top:26px;">
                  <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 20px;background:#2563eb;border-radius:9px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Open dashboard</a>
                </div>
                <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5;">
                  If the button does not work, open this link:<br>
                  <a href="${escapeHtml(dashboardUrl)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(dashboardUrl)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return getTransporter().sendMail({
    from,
    to: { address: to },
    subject,
    text,
    html
  });
}

module.exports = {
  sendTaskDueEmail
};