const express = require('express');
const { createAuthService, DUMMY_PASSWORD_HASH } = require('../services/auth-service');
const { createAuthMiddleware } = require('../middleware/auth');

const STAFF_ROLES = ['superadmin', 'admin'];

function createAuthRouter(config, authService = createAuthService(config)) {
  const router = express.Router();
  const { authenticateToken, authorizeRoles } = createAuthMiddleware(config, authService);
  const requireStaff = authorizeRoles(...STAFF_ROLES);

  router.post('/staff/login', async (request, response, next) => {
    try {
      const { identifier, username, email, password } = request.body || {};
      const loginIdentifier = String(identifier || username || email || '').trim().slice(0, 128);
      const user = loginIdentifier ? await authService.findByLogin(loginIdentifier) : null;
      const isStaff = user && authService.isStaff(user);
      const isActive = user && user.isActive === true;
      const passwordHash = user?.passwordHash || DUMMY_PASSWORD_HASH;
      const isValidPassword = await authService.comparePassword(password || '', passwordHash);

      if (!isStaff || !isActive || !isValidPassword) {
        await authService.recordAuthLog({
          username: user?.username || loginIdentifier,
          role: user?.role || 'unknown',
          action: 'staff_login',
          status: 'failure',
        });
        return response.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        });
      }

      const token = authService.signToken(user);
      await authService.recordAuthLog({
        username: user.username,
        role: user.role,
        action: 'staff_login',
        status: 'success',
      });

      router.post(
        '/staff/users',
        authenticateToken,
        authorizeRoles('superadmin'),
        async (request, response, next) => {
          try {
            const { username, email, password } = request.body || {};
            const user = await authService.createStaffUser({ username, email, password });
            return response.status(201).json({ user });
          } catch (error) {
            if (error.code === 'STAFF_ACCOUNT_EXISTS' || error.code === 11000) {
              return response.status(409).json({
                error: { code: error.code, message: error.message },
              });
            }
            return next(error);
          }
        },
      );

      return response.json({
        token,
        expiresAt: authService.getTokenExpiration(token),
        user: authService.sanitizeUser(user),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/staff/me', authenticateToken, requireStaff, (request, response) => {
    response.json({ user: authService.sanitizeUser(request.user), expiresAt: request.tokenExpiresAt });
  });

  router.post('/staff/logout', authenticateToken, requireStaff, async (request, response, next) => {
    try {
      await authService.revokeTokens(request.user._id || request.user.id);
      await authService.recordAuthLog({
        username: request.user.username,
        role: request.user.role,
        action: 'staff_logout',
        status: 'success',
      });
      return response.json({ message: 'ออกจากระบบเรียบร้อยแล้ว' });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/users', authenticateToken, requireStaff, async (request, response, next) => {
    try {
      const users = await authService.listUsers();
      const role = String(request.user.role).toLowerCase();
      const filteredUsers = role === 'admin'
        ? users.filter((user) => user.role === 'user')
        : users;
      return response.json({ users: filteredUsers });
    } catch (error) {
      return next(error);
    }
  });

  router.patch(
    '/users/:userId/role',
    authenticateToken,
    authorizeRoles('superadmin'),
    async (request, response, next) => {
      try {
        const targetUser = await authService.findById(request.params.userId);
        if (!targetUser) {
          return response.status(404).json({
            error: { code: 'USER_NOT_FOUND', message: 'Target user was not found' },
          });
        }

        if (targetUser.role === 'superadmin') {
          return response.status(403).json({
            error: { code: 'SUPERADMIN_PROTECTED', message: 'Super admin privileges cannot be modified by this route' },
          });
        }

        const role = String(request.body?.role || '').toLowerCase();
        if (!['user', 'admin'].includes(role)) {
          return response.status(400).json({
            error: { code: 'INVALID_ROLE', message: 'Role must be user or admin' },
          });
        }

        const user = await authService.updateUser(request.params.userId, { role });
        return response.json({ message: 'User role updated successfully', user });
      } catch (error) {
        return next(error);
      }
    },
  );

  router.patch(
    '/users/:userId/status',
    authenticateToken,
    requireStaff,
    async (request, response, next) => {
      try {
        const targetUser = await authService.findById(request.params.userId);
        if (!targetUser) {
          return response.status(404).json({
            error: { code: 'USER_NOT_FOUND', message: 'Target user was not found' },
          });
        }

        if (request.user.role === 'admin' && targetUser.role === 'superadmin') {
          return response.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Admin cannot modify super admin accounts' },
          });
        }

        if (typeof request.body?.isActive !== 'boolean') {
          return response.status(400).json({
            error: { code: 'INVALID_STATUS', message: 'isActive must be a boolean' },
          });
        }

        const user = await authService.updateUser(request.params.userId, {
          isActive: request.body.isActive,
        });
        return response.json({ message: 'User status updated successfully', user });
      } catch (error) {
        return next(error);
      }
    },
  );

  return router;
}

module.exports = { createAuthRouter };
