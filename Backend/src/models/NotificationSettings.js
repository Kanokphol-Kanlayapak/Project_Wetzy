const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSettingsSchema = new Schema({
  userId: { type: String, required: true, index: true },
  enabled: { type: Boolean, default: true },
  highRiskEnabled: { type: Boolean, default: true },
  followedAreas: [{ type: String }],
}, { timestamps: true, collection: 'notification_settings', autoCreate: false });

module.exports = mongoose.models.NotificationSettings || mongoose.model('NotificationSettings', NotificationSettingsSchema);
