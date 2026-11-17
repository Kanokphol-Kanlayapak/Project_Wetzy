const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSettingsSchema = new Schema({
  enabled: { type: Boolean, default: true },
  highRiskEnabled: { type: Boolean, default: true },
  followedAreas: [{ type: String }],
}, { _id: false });

const UserSchema = new Schema({
  username: { type: String, required: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  expoPushTokens: [{ type: String }],
  notificationSettings: { type: NotificationSettingsSchema, default: undefined },
}, {
  timestamps: true,
  collection: 'users',
  toJSON: {
    transform(_document, returned) {
      delete returned.passwordHash;
      delete returned.tokenVersion;
      delete returned.__v;
      return returned;
    },
  },
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema, 'User');
