function createAuthMiddleware(config, authService) {
  async function authenticateToken(request, response, next) {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return response.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication token is required' },
      });
    }

    const payload = authService.verifyToken(token);
    if (!payload || typeof payload.sub !== 'string') {
      return response.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Authentication token is invalid or expired' },
      });
    }

    const user = await authService.findById(payload.sub);
    if (!user || user.isActive !== true) {
      return response.status(401).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active or no longer exists' },
      });
    }

    if ((user.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
      return response.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Authentication token is invalid or expired' },
      });
    }

    request.user = user;
    request.tokenExpiresAt = payload.exp ? payload.exp * 1000 : null;
    return next();
  }

  function authorizeRoles(...allowedRoles) {
    const roles = new Set(allowedRoles.flat().map((role) => String(role).toLowerCase()));

    return function authorize(request, response, next) {
      if (!request.user) {
        return response.status(401).json({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication is required' },
        });
      }

      if (!roles.has(String(request.user.role).toLowerCase())) {
        return response.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' },
        });
      }

      return next();
    };
  }

  function requireActiveAccount(request, response, next) {
    if (!request.user || request.user.isActive !== true) {
      return response.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive and cannot perform this action' },
      });
    }

    return next();
  }

  return {
    authenticateToken,
    authorizeRoles,
    requireActiveAccount,
  };
}

module.exports = { createAuthMiddleware };
