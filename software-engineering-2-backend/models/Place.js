/**
 * Place Model
 * Mongoose schema for travel places and locations
 * @module models/Place
 */
import mongoose from 'mongoose';

const requiredString = { type: String, required: true, trim: true };
const optionalString = { type: String, trim: true };
const locationCoord = { latitude: Number, longitude: Number };

const placeSchema = new mongoose.Schema({
  placeId: { type: Number, required: true, unique: true },
  name: requiredString,
  category: { type: String, required: true },
  description: optionalString,
  address: optionalString,
  city: optionalString,
  country: optionalString,
  location: locationCoord,
  website: String,
  rating: { type: Number, default: 0, min: 0, max: 5 }
}, { timestamps: true });

placeSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
placeSchema.index({ category: 1 });
placeSchema.index({ city: 1 });
placeSchema.index({ name: 'text', description: 'text', city: 'text' });

placeSchema.statics.findByCategory = function (category) {
  return this.find({ category });
};

placeSchema.statics.findByCity = function (city) {
  return this.find({ city });
};

placeSchema.statics.findNearLocation = function (lat, lng, maxDistance) {
  const latRange = maxDistance / 111;
  const lngRange = maxDistance / (111 * Math.cos(lat * Math.PI / 180));
  return this.find({
    'location.latitude': { $gte: lat - latRange, $lte: lat + latRange },
    'location.longitude': { $gte: lng - lngRange, $lte: lng + lngRange }
  });
};

placeSchema.methods.hasValidLocation = function () {
  return this.location && this.location.latitude != null && this.location.longitude != null;
};

placeSchema.methods.getFullAddress = function () {
  const parts = [this.address, this.city, this.country].filter(Boolean);
  return parts.join(', ');
};

export default mongoose.model('Place', placeSchema);
