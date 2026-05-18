/**
 * Review Model
 * Mongoose schema for place reviews
 * @module models/Review
 */
import mongoose from 'mongoose';

const requiredNumber = { type: Number, required: true };
const requiredUniqueNumber = { type: Number, required: true, unique: true };
const timestampField = { type: Date, default: Date.now };

const reviewSchema = new mongoose.Schema({
  reviewId: requiredUniqueNumber,
  userId: requiredNumber,
  placeId: requiredNumber,
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String,
  createdAt: timestampField
});

reviewSchema.index({ placeId: 1 });
reviewSchema.index({ userId: 1 });

reviewSchema.statics.findByPlaceId = function (placeId) {
  return this.find({ placeId }).sort({ createdAt: -1 });
};

reviewSchema.statics.findByUserId = function (userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

reviewSchema.statics.getAverageRating = async function (placeId) {
  const result = await this.aggregate([
    { $match: { placeId } },
    { $group: { _id: null, avgRating: { $avg: '$rating' } } }
  ]);
  return result.length > 0 ? result[0].avgRating : 0;
};

reviewSchema.methods.isOwnedBy = function (userId) {
  return this.userId === userId;
};

reviewSchema.methods.isPositive = function () {
  return this.rating >= 4;
};

reviewSchema.methods.isNegative = function () {
  return this.rating <= 2;
};

export default mongoose.model('Review', reviewSchema);
