/**
 * Disliked Place Model
 * Mongoose schema for user disliked places
 * @module models/DislikedPlace
 */
import mongoose from 'mongoose';

const requiredNumber = { type: Number, required: true };
const requiredUniqueNumber = { type: Number, required: true, unique: true };
const timestampField = { type: Date, default: Date.now };

const dislikedPlaceSchema = new mongoose.Schema({
  dislikedId: requiredUniqueNumber,
  userId: requiredNumber,
  placeId: requiredNumber,
  addedAt: timestampField
});

dislikedPlaceSchema.index({ userId: 1 });
dislikedPlaceSchema.index({ placeId: 1 });

dislikedPlaceSchema.statics.findByUserId = function (userId) {
  return this.find({ userId }).sort({ addedAt: -1 });
};

dislikedPlaceSchema.statics.findByPlaceId = function (placeId) {
  return this.find({ placeId });
};

dislikedPlaceSchema.statics.removeByUserAndPlace = function (userId, placeId) {
  return this.findOneAndDelete({ userId, placeId });
};

dislikedPlaceSchema.methods.isOwnedBy = function (userId) {
  return this.userId === userId;
};

export default mongoose.model('DislikedPlace', dislikedPlaceSchema);
