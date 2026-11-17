const mongoose = require('mongoose');
const { Schema } = mongoose;

const FloodPredictionSchema = new Schema({}, {
  strict: false,
  timestamps: true,
  collection: 'Flood_predictions',
});

module.exports = mongoose.models.FloodPrediction
  || mongoose.model('FloodPrediction', FloodPredictionSchema, 'Flood_predictions');
