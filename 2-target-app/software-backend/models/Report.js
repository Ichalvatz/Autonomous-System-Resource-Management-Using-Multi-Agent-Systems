/**
 * Report Model
 * Mongoose schema for place reports
 * @module models/Report
 */
import mongoose from 'mongoose';

const requiredNumber = { type: Number, required: true };
const requiredUniqueNumber = { type: Number, required: true, unique: true };
const timestampField = { type: Date, default: Date.now };
const statusValues = ['PENDING', 'REVIEWED', 'RESOLVED'];

const reportSchema = new mongoose.Schema({
  reportId: requiredUniqueNumber,
  userId: requiredNumber,
  placeId: requiredNumber,
  description: { type: String, required: true },
  status: { type: String, enum: statusValues, default: 'PENDING' },
  createdAt: timestampField,
  resolvedAt: Date
});

reportSchema.index({ placeId: 1 });
reportSchema.index({ status: 1 });

reportSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

reportSchema.statics.findPending = function () {
  return this.find({ status: 'PENDING' });
};

reportSchema.statics.findByPlaceId = function (placeId) {
  return this.find({ placeId });
};

reportSchema.methods.resolve = function () {
  this.status = 'RESOLVED';
  this.resolvedAt = new Date();
  return this.save();
};

reportSchema.methods.markReviewed = function () {
  this.status = 'REVIEWED';
  return this.save();
};

reportSchema.methods.isPending = function () {
  return this.status === 'PENDING';
};

reportSchema.methods.isResolved = function () {
  return this.status === 'RESOLVED';
};

export default mongoose.model('Report', reportSchema);
