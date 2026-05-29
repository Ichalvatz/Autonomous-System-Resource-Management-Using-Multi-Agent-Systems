/**
 * User Model
 * Mongoose schema for application users
 * @module models/User
 */
import mongoose from 'mongoose';

const requiredString = { type: String, required: true, trim: true };
const optionalString = { type: String, trim: true };
const locationCoord = { latitude: Number, longitude: Number };
const roleValues = ['user', 'admin'];

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  name: requiredString,
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: optionalString,
  dateOfBirth: String,
  password: { type: String, required: true },
  role: { type: String, enum: roleValues, default: 'user' },
  preferences: { categories: [String], tags: [String] },
  location: locationCoord,
  activeProfile: Number
}, { timestamps: true });

userSchema.index({ role: 1 });

userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findAdmins = function () {
  return this.find({ role: 'admin' });
};

userSchema.statics.findUsers = function () {
  return this.find({ role: 'user' });
};

userSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

userSchema.methods.hasLocation = function () {
  return this.location && this.location.latitude != null && this.location.longitude != null;
};

userSchema.methods.hasPreference = function (category) {
  return this.preferences && this.preferences.categories &&
    this.preferences.categories.includes(category);
};

userSchema.methods.setActiveProfile = function (profileId) {
  this.activeProfile = profileId;
  return this.save();
};

export default mongoose.model('User', userSchema);
