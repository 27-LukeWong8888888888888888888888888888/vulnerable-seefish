'use strict';


const { resolveToken } = require('./appTokens');

function requireAuth(req, res, next) {
  const token = req.body && typeof req.body === 'object' ? req.body.token : undefined;
  const record = resolveToken(token);
  if (!record) {
    return res.status(401).json({ error: 'auth_required', message: 'valid login token required in request payload' });
  }
  req.user = record;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden', required: roles, role: req.user.role });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
