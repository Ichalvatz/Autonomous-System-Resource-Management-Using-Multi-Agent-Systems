/**
 * Preference Profile Model
 * Mongoose schema for user preference profiles
 * @module models/PreferenceProfile
 */
import mongoose from 'mongoose';

const requiredNumber = { type: Number, required: true };
const requiredUniqueNumber = { type: Number, required: true, unique: true };
const stringArray = { type: [String], default: [] };
const timestampField = { type: Date, default: Date.now };

const preferenceProfileSchema = new mongoose.Schema({
  profileId: requiredUniqueNumber,
  userId: requiredNumber,
  name: { type: String, required: true },
  categories: stringArray,
  priceRange: { min: { type: Number, default: 0 }, max: { type: Number, default: 1000 } },
  tags: stringArray,
  isActive: { type: Boolean, default: false },
  createdAt: timestampField,
  updatedAt: timestampField
});

preferenceProfileSchema.index({ userId: 1 });

preferenceProfileSchema.statics.findByUserId = function (userId) {
  return this.find({ userId });
};

preferenceProfileSchema.statics.findActiveByUserId = function (userId) {
  return this.findOne({ userId, isActive: true });
};

preferenceProfileSchema.statics.deactivateAllForUser = function (userId) {
  return this.updateMany({ userId }, { isActive: false, updatedAt: new Date() });
};

preferenceProfileSchema.methods.activate = function () {
  this.isActive = true;
  this.updatedAt = new Date();
  return this.save();
};

preferenceProfileSchema.methods.hasCategory = function (category) {
  return this.categories.includes(category);
};

preferenceProfileSchema.methods.hasTag = function (tag) {
  return this.tags.includes(tag);
};

export default mongoose.model('PreferenceProfile', preferenceProfileSchema);
