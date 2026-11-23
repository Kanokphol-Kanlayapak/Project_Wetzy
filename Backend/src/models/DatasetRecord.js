const mongoose = require('mongoose');
const { Schema } = mongoose;

// One document per CSV row. Values live under `data` so column names can never collide
// with (or inject into) the document's own fields.
const DatasetRecordSchema = new Schema({
  datasetId: { type: Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true },
  rowIndex: { type: Number, required: true },
  data: { type: Schema.Types.Mixed, required: true },
}, { versionKey: false, minimize: false, collection: 'dataset_records' });

DatasetRecordSchema.index({ datasetId: 1, rowIndex: 1 });

module.exports = mongoose.models.DatasetRecord
  || mongoose.model('DatasetRecord', DatasetRecordSchema, 'dataset_records');
