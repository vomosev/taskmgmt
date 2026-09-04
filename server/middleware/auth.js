const jwt = require('jsonwebtoken');

function unauthorized(res, message) {
  return res.status(401).json({ error: message });
}

function requireAuth(req, res, next) {
  const authorization = req.get('authorization');

  if (!authorization) {
    return unauthorized(res, 'Authentication token is required');
  }

  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return unauthorized(res, 'Invalid authorization header');
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new Error('JWT_SECRET is not configured'));
  }

  try {
    const payload = jwt.verify(match[1], secret);

    if (
      !payload ||
      typeof payload !== 'object' ||
      !Number.isInteger(Number(payload.id)) ||
      Number(payload.id) <= 0 ||
      typeof payload.email !== 'string' ||
      payload.email.trim() === ''
    ) {
      return unauthorized(res, 'Invalid authentication token');
    }

    req.user = {
      id: Number(payload.id),
      email: payload.email.trim().toLowerCase(),
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return unauthorized(res, 'Authentication token has expired');
    }

    return unauthorized(res, 'Invalid authentication token');
  }
}

module.exports = {
  requireAuth,
};