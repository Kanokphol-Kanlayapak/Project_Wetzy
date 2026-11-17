const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const Notification = require('../models/Notification');

const STAFF_ROLES = new Set(['admin', 'superadmin']);
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('wetzy-nonexistent-account-password', 12);

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeUser(user) {
  if (!user) return null;

  const record = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    id: String(record._id || record.id),
    username: record.username,
    email: record.email,
    role: record.role,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function createAuthService(config = {}, models = {}) {
  const UserModel = models.User || User;
  const SystemLogModel = models.SystemLog || SystemLog;
  const NotificationModel = models.Notification || Notification;

  function signToken(user) {
    if (!config.jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign({
      sub: String(user._id || user.id),
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
    }, config.jwtSecret, { expiresIn: config.jwtExpiresIn || '7d' });
  }

  function verifyToken(token) {
    if (!config.jwtSecret || !token) return null;

    try {
      return jwt.verify(token, config.jwtSecret);
    } catch {
      return null;
    }
  }

  function getTokenExpiration(token) {
    const payload = jwt.decode(token);
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  }

  async function findByLogin(identifier) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;

    return UserModel.findOne({
      $or: [{ username: normalized }, { email: normalized }],
    }).select('+passwordHash');
  }

  async function findById(id) {
    return UserModel.findById(id);
  }

  async function listUsers() {
    const users = await UserModel.find().sort({ createdAt: -1 });
    return users.map(sanitizeUser);
  }

  async function updateUser(userId, updates) {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true },
    );
    return sanitizeUser(user);
  }

  async function revokeTokens(userId) {
    return UserModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true });
  }

  async function recordAuthLog({ username, role, action, status }) {
    const safeUsername = String(username || '').trim().slice(0, 128);
    await SystemLogModel.create({
      username: safeUsername,
      role: role || 'unknown',
      action,
      timestamp: new Date(),
      status,
    });
  }

  async function ensureSeedSuperAdmin() {
    const seed = config.initialSuperAdmin || {};
    const username = normalizeIdentifier(seed.username);
    const email = normalizeIdentifier(seed.email);
    const password = String(seed.password || '');

    if (!username && !email && !password) return null;
    if (!username || !email || password.length < 12) {
      throw new Error('Initial superadmin requires a username, email, and a password of at least 12 characters');
    }

    const existing = await UserModel.findOne({
      $or: [{ username }, { email }],
    });
    if (existing) return sanitizeUser(existing);

    const user = await UserModel.create({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'superadmin',
      isActive: true,
    });
    return sanitizeUser(user);
  }

  async function createStaffUser({ username, email, password }) {
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeIdentifier(email);
    if (!normalizedUsername || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      const error = new Error('A username and valid email are required');
      error.status = 400;
      error.code = 'INVALID_STAFF_DETAILS';
      throw error;
    }

    if (typeof password !== 'string' || password.length < 12) {
      const error = new Error('Password must be at least 12 characters long');
      error.status = 400;
      error.code = 'WEAK_PASSWORD';
      throw error;
    }

    const existing = await UserModel.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });
    if (existing) {
      const error = new Error('Username or email already exists');
      error.status = 409;
      error.code = 'STAFF_ACCOUNT_EXISTS';
      throw error;
    }

    const user = await UserModel.create({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      isActive: true,
    });
    return sanitizeUser(user);
  }

  async function upsertNotificationSettings(userId, overrides = {}) {
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { notificationSettings: overrides } },
      { new: true, runValidators: true },
    );
    if (!user) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return {
      userId: String(user._id || user.id),
      enabled: user.notificationSettings?.enabled ?? true,
      highRiskEnabled: user.notificationSettings?.highRiskEnabled ?? true,
      followedAreas: user.notificationSettings?.followedAreas || [],
    };
  }

  async function getNotificationSettings(userId) {
    const user = await UserModel.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    return {
      userId: String(user._id || user.id),
      enabled: user.notificationSettings?.enabled ?? true,
      highRiskEnabled: user.notificationSettings?.highRiskEnabled ?? true,
      followedAreas: user.notificationSettings?.followedAreas || [],
    };
  }

  async function listNotifications(userId) {
    return NotificationModel.find({ userId }).sort({ sentAt: -1 });
  }

  async function addNotification(notification) {
    return NotificationModel.create(notification);
  }

  return {
    findByLogin,
    findById,
    listUsers,
    updateUser,
    revokeTokens,
    hashPassword: (password) => bcrypt.hash(String(password), 12),
    comparePassword: (password, passwordHash) => bcrypt.compare(String(password), passwordHash),
    signToken,
    verifyToken,
    getTokenExpiration,
    sanitizeUser,
    recordAuthLog,
    ensureSeedSuperAdmin,
    createStaffUser,
    upsertNotificationSettings,
    getNotificationSettings,
    addNotification,
    listNotifications,
    isStaff: (user) => STAFF_ROLES.has(String(user?.role || '').toLowerCase()),
  };
}

module.exports = {
  createAuthService,
  normalizeIdentifier,
  sanitizeUser,
  DUMMY_PASSWORD_HASH,
};
