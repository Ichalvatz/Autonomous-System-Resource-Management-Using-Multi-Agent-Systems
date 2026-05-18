/**
 * Favourite Place Model
 * Mongoose schema for user favourite places
 * @module models/FavouritePlace
 */
import mongoose from 'mongoose';

const requiredNumber = { type: Number, required: true };
const requiredUniqueNumber = { type: Number, required: true, unique: true };
const timestampField = { type: Date, default: Date.now };

const favouritePlaceSchema = new mongoose.Schema({
  favouriteId: requiredUniqueNumber,
  userId: requiredNumber,
  placeId: requiredNumber,
  addedAt: timestampField
});

favouritePlaceSchema.index({ userId: 1 });
favouritePlaceSchema.index({ placeId: 1 });

favouritePlaceSchema.statics.findByUserId = function (userId) {
  return this.find({ userId }).sort({ addedAt: -1 });
};

favouritePlaceSchema.statics.findByPlaceId = function (placeId) {
  return this.find({ placeId });
};

favouritePlaceSchema.statics.removeByUserAndPlace = function (userId, placeId) {
  return this.findOneAndDelete({ userId, placeId });
};

favouritePlaceSchema.methods.isOwnedBy = function (userId) {
  return this.userId === userId;
};

export default mongoose.model('FavouritePlace', favouritePlaceSchema);
