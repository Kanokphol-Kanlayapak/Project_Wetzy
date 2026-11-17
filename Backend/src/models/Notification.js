const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  areaId: { type: String, required: true, index: true },
  areaName: { type: String, default: '' },
  riskLevel: { type: String, default: 'high' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  predictionDate: { type: String, default: '' },
  isRead: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now },
  deliveryStatus: { type: String, default: 'sent' },
}, { timestamps: true, collection: 'Notifications' });

module.exports = mongoose.models.Notification
  || mongoose.model('Notification', NotificationSchema, 'Notifications');
