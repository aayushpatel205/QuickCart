/**
 * Microservice Trust Boundary:
 * Gateway terminates JWT and injects X-User-Id and X-User-Role.
 * Restaurant Service trusts these forwarded headers.
 */

function extractUserHeaders(req, res, next) {
  const userId = req.headers['x-user-id'] || null;
  const userRole = (req.headers['x-user-role'] || 'ANONYMOUS').toUpperCase();

  req.user = {
    id: userId,
    role: userRole
  };

  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    if (req.log) {
      req.log.warn(
        { userId: req.user?.id, role: req.user?.role },
        'Access denied: ADMIN role required'
      );
    }
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied: Admin role required via X-User-Role header',
      receivedRole: req.user?.role || 'NONE'
    });
  }
  next();
}

module.exports = {
  extractUserHeaders,
  requireAdmin
};
