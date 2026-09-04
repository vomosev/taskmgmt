const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 12;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateSignupInput(body) {
  const name = normalizeName(body?.name);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  const details = [];

  if (!name) {
    details.push({ field: 'name', message: 'Name is required.' });
  } else if (name.length > MAX_NAME_LENGTH) {
    details.push({
      field: 'name',
      message: `Name must not exceed ${MAX_NAME_LENGTH} characters.`
    });
  }

  if (!email) {
    details.push({ field: 'email', message: 'Email is required.' });
  } else if (
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email)
  ) {
    details.push({
      field: 'email',
      message: 'A valid email address is required.'
    });
  }

  if (!password) {
    details.push({ field: 'password', message: 'Password is required.' });
  } else {
    if (password.length < MIN_PASSWORD_LENGTH) {
      details.push({
        field: 'password',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      });
    }

    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      details.push({
        field: 'password',
        message: `Password must not exceed ${MAX_PASSWORD_BYTES} bytes.`
      });
    }
  }

  return {
    value: { name, email, password },
    details
  };
}

function validateLoginInput(body) {
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  const details = [];

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    details.push({
      field: 'email',
      message: 'A valid email address is required.'
    });
  }

  if (!password) {
    details.push({ field: 'password', message: 'Password is required.' });
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    details.push({
      field: 'password',
      message: 'Invalid email or password.'
    });
  }

  return {
    value: { email, password },
    details
  };
}

function safeUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    createdAt: row.created_at
  };
}

function issueToken(user) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    const error = new Error('JWT configuration is unavailable.');
    error.statusCode = 500;
    throw error;
  }

  return jwt.sign(
    {
      userId: Number(user.id),
      email: user.email
    },
    secret,
    { expiresIn }
  );
}

function sendValidationError(res, details) {
  return res.status(400).json({
    error: 'Validation failed.',
    details
  });
}

async function signup(req, res, next) {
  const { value, details } = validateSignupInput(req.body);

  if (details.length > 0) {
    return sendValidationError(res, details);
  }

  try {
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [value.email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(value.password, BCRYPT_ROUNDS);

    let result;
    try {
      [result] = await pool.execute(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [value.name, value.email, passwordHash]
      );
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'An account with this email already exists.'
        });
      }
      throw error;
    }

    const [users] = await pool.execute(
      'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
      [result.insertId]
    );

    if (users.length === 0) {
      const error = new Error('The newly created user could not be loaded.');
      error.statusCode = 500;
      throw error;
    }

    const user = safeUser(users[0]);
    const token = issueToken(user);

    return res.status(201).json({ token, user });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  const { value, details } = validateLoginInput(req.body);

  if (details.length > 0) {
    return sendValidationError(res, details);
  }

  try {
    const [users] = await pool.execute(
      `SELECT id, name, email, password_hash, created_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [value.email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const userRow = users[0];
    const passwordMatches = await bcrypt.compare(
      value.password,
      userRow.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const user = safeUser(userRow);
    const token = issueToken(user);

    return res.status(200).json({ token, user });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentUser(req, res, next) {
  try {
    const userId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        error: 'Authentication is required.'
      });
    }

    const [users] = await pool.execute(
      'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: 'The authenticated user no longer exists.'
      });
    }

    return res.status(200).json({
      user: safeUser(users[0])
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  signup,
  login,
  getCurrentUser
};