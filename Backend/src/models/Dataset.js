const mongoose = require('mongoose');
const { Schema } = mongoose;

const DatasetSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, required: true },
  filename: { type: String, default: '', maxlength: 200 },
  columns: [{ type: String }],
  totalRows: { type: Number, default: 0 },
  insertedRows: { type: Number, default: 0 },
  rejectedRows: { type: Number, default: 0 },
  errorSamples: [{ _id: false, row: Number, message: String }],
  status: { type: String, enum: ['uploading', 'ready', 'failed'], default: 'uploading' },
  uploadedBy: {
    _id: false,
    id: { type: String, default: '' },
    username: { type: String, default: '' },
  },
}, { timestamps: true, collection: 'datasets' });

DatasetSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema, 'datasets');
