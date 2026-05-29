/**
 * Settings Model
 * Mongoose schema for user settings
 * @module models/Settings
 */
import mongoose from 'mongoose';

const requiredUniqueNumber = { type: Number, required: true, unique: true };
const timestampField = { type: Date, default: Date.now };
const supportedLanguages = ['el', 'en', 'de', 'fr', 'es'];

const settingsSchema = new mongoose.Schema({
  userId: requiredUniqueNumber,
  language: { type: String, default: 'el' },
  emailNotifications: { type: Boolean, default: true },
  pushNotifications: { type: Boolean, default: false },
  updatedAt: timestampField
});

settingsSchema.statics.findByUserId = function (userId) {
  return this.findOne({ userId });
};

settingsSchema.statics.createDefaultForUser = function (userId) {
  return this.create({ userId });
};

settingsSchema.statics.updateForUser = function (userId, updates) {
  return this.findOneAndUpdate(
    { userId },
    { ...updates, updatedAt: new Date() },
    { new: true, upsert: true }
  );
};

settingsSchema.methods.enableEmailNotifications = function () {
  this.emailNotifications = true;
  this.updatedAt = new Date();
  return this.save();
};

settingsSchema.methods.disableEmailNotifications = function () {
  this.emailNotifications = false;
  this.updatedAt = new Date();
  return this.save();
};

settingsSchema.methods.setLanguage = function (lang) {
  if (supportedLanguages.includes(lang)) {
    this.language = lang;
    this.updatedAt = new Date();
    return this.save();
  }
  throw new Error('Unsupported language');
};

settingsSchema.methods.togglePushNotifications = function () {
  this.pushNotifications = !this.pushNotifications;
  this.updatedAt = new Date();
  return this.save();
};

export default mongoose.model('Settings', settingsSchema);
