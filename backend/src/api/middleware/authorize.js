const LEVELS = { reader: 1, contributor: 2, reviewer: 3, admin: 4 };
export function requireRole(role) {
  return (req, res, next) => {
    if ((LEVELS[req.user?.role] || 0) >= (LEVELS[role] || 99)) return next();
    res.status(403).json({ error: 'Insufficient permissions' });
  };
}
