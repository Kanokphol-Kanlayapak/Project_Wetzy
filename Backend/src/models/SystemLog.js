const mongoose = require('mongoose');
const { Schema } = mongoose;

const SystemLogSchema = new Schema({
  username: { type: String, default: '' },
  role: { type: String, default: 'unknown' },
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failure'], required: true },
}, {
  versionKey: false,
  collection: 'system_logs',
});

module.exports = mongoose.models.SystemLog || mongoose.model('SystemLog', SystemLogSchema, 'system_logs');
