const express = require('express');
const { createAuthService } = require('../services/auth-service');
const { createAuthMiddleware } = require('../middleware/auth');

function normalizeRiskLevel(payload = {}) {
  const riskLevel = String(payload.riskLevel || payload.level || payload.risk || '').toLowerCase();
  const riskScore = Number(payload.riskScore ?? payload.score ?? payload.riskValue ?? NaN);
  const probability = Number(payload.probability ?? payload.confidence ?? NaN);

  if (['critical', 'severe', 'high'].includes(riskLevel)) {
    return 'high';
  }

  if (!Number.isNaN(riskScore) && riskScore >= 80) {
    return 'high';
  }

  if (!Number.isNaN(probability) && probability >= 0.8) {
    return 'high';
  }

  return 'normal';
}

function createNotificationRouter(config, authService = createAuthService(config)) {
  const router = express.Router();
  const { authenticateToken, authorizeRoles, requireActiveAccount } = createAuthMiddleware(config, authService);

  router.get('/settings', authenticateToken, requireActiveAccount, async (request, response) => {
    response.json({ settings: await authService.getNotificationSettings(String(request.user._id || request.user.id)) });
  });

  router.put('/settings', authenticateToken, requireActiveAccount, async (request, response) => {
    const { enabled, highRiskEnabled, followedAreas } = request.body || {};
    const settings = await authService.upsertNotificationSettings(String(request.user._id || request.user.id), {
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      highRiskEnabled: highRiskEnabled !== undefined ? Boolean(highRiskEnabled) : true,
      followedAreas: Array.isArray(followedAreas) ? followedAreas.map(String) : [],
    });

    response.json({ message: 'Notification settings updated successfully', settings });
  });

  router.get('/history', authenticateToken, requireActiveAccount, async (request, response) => {
    response.json({ notifications: await authService.listNotifications(String(request.user._id || request.user.id)) });
  });

  router.post('/trigger', authenticateToken, authorizeRoles('superadmin', 'admin'), requireActiveAccount, async (request, response) => {
    const payload = request.body || {};
    const areaId = String(payload.areaId || payload.area_id || '').trim();
    const areaName = String(payload.areaName || payload.area_name || payload.district || '').trim();
    const predictionDate = payload.predictionDate || payload.prediction_date || new Date().toISOString();
    const riskLevel = normalizeRiskLevel(payload);

    if (!areaId || !predictionDate) {
      return response.status(400).json({
        error: { code: 'MISSING_ALERT_CONTEXT', message: 'areaId and predictionDate are required' },
      });
    }

    if (riskLevel !== 'high') {
      return response.json({
        triggered: false,
        message: 'High-risk threshold was not met for the supplied ML result',
      });
    }

    const users = (await authService.listUsers()).filter((user) => user.isActive !== false);
    const settingsByUser = await Promise.all(users.map((user) => authService.getNotificationSettings(user.id)));
    const alerts = users.filter((user, index) => {
      const settings = settingsByUser[index];
      return settings.enabled !== false && settings.highRiskEnabled !== false && settings.followedAreas.includes(areaId);
    });

    const sent = await Promise.all(alerts.map(async (user) => {
      const userNotifications = await authService.listNotifications(user.id);
      const existingNotification = userNotifications.find((notification) => (
        notification.areaId === areaId
        && notification.predictionDate === predictionDate
        && notification.riskLevel === 'high'
      ));

      if (existingNotification) {
        return { userId: user.id, status: 'skipped_duplicate' };
      }

      const message = `พื้นที่ ${areaName || areaId} มีการประเมินความเสี่ยงน้ำท่วมอยู่ในระดับสูง ในวันที่ ${predictionDate}`;
      const notification = await authService.addNotification({
        userId: user.id,
        areaId,
        areaName: areaName || areaId,
        riskLevel: 'high',
        title: 'แจ้งเตือนความเสี่ยงน้ำท่วมสูง',
        message,
        predictionDate,
        deliveryStatus: 'sent',
      });

      return { userId: user.id, notificationId: notification.id, status: 'sent' };
    }));

    return response.status(200).json({
      triggered: sent.length > 0,
      sentCount: sent.length,
      results: sent,
    });
  });

  return router;
}

module.exports = { createNotificationRouter, normalizeRiskLevel };
