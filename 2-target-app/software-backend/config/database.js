/**
 * Database Configuration - MongoDB connection and utilities
 */
import mongoose from 'mongoose';
import models from '../models/index.js';
import initialData from './seedData.js';

let isConnected = false;

// Establish MongoDB connection and seed initial data if needed
const connectDB = async () => {
  // Skip if already connected
  if (isConnected) { console.log('✓ Already connected to MongoDB'); return; }

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) throw new Error('MONGODB_URI is not defined in .env file');

  try {
    await mongoose.connect(mongoURI);
    isConnected = true;
    console.log('✓ MongoDB Connected Successfully');
    console.log(`  Database: ${mongoose.connection.name}`);
    if (process.env.DISABLE_SEEDING !== 'true') await seedInitialData();
  } catch (error) {
    console.error('✗ MongoDB Connection Error:', error.message);
    throw error;
  }
};

// Close MongoDB connection gracefully
const disconnectDB = async () => {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('✓ MongoDB Disconnected');
  } catch (error) {
    console.error('✗ Error disconnecting from MongoDB:', error.message);
    throw error;
  }
};

// Populate database with initial seed data from JSON files
const seedInitialData = async () => {
  try {
    // Skip if data already exists
    if (await models.User.countDocuments() > 0) {
      console.log('✓ Database already contains data. Skipping seeding.');
      return;
    }

    console.log('📦 Seeding initial data...');
    // Insert all entity types
    await models.User.insertMany(initialData.users);
    await models.Place.insertMany(initialData.places);
    await models.PreferenceProfile.insertMany(initialData.preferenceProfiles);
    await models.Review.insertMany(initialData.reviews);
    await models.Report.insertMany(initialData.reports);
    await models.FavouritePlace.insertMany(initialData.favouritePlaces);
    await models.DislikedPlace.insertMany(initialData.dislikedPlaces);
    await models.Settings.insertMany(initialData.settings);

    // Initialize ID counters for auto-increment
    const counters = Object.entries(initialData.counters).map(([name, value]) => ({ name, value }));
    await models.Counter.insertMany(counters);
    console.log('✓ Initial data seeding completed successfully!');
  } catch (error) {
    console.error('✗ Error seeding initial data:', error.message);
    throw error;
  }
};

// Generate next sequential ID for a counter (auto-increment)
const getNextId = async (counterName) => {
  const counter = await models.Counter.findOneAndUpdate({ name: counterName }, { $inc: { value: 1 } }, { new: true, upsert: true });
  return counter.value;
};

// Remove all data from database (used in testing)
const clearAllData = async () => {
  try {
    // Skip if database not connected
    if (mongoose.connection.readyState !== 1) {
      console.warn('⚠️  clearAllData called when MongoDB is not connected; skipping');
      return;
    }
    // Delete all documents from all collections
    await Promise.all([
      models.User.deleteMany({}), models.Place.deleteMany({}), models.PreferenceProfile.deleteMany({}),
      models.Review.deleteMany({}), models.Report.deleteMany({}), models.FavouritePlace.deleteMany({}),
      models.DislikedPlace.deleteMany({}), models.Settings.deleteMany({}), models.Counter.deleteMany({})
    ]);
    console.log('✓ All data cleared');
  } catch (error) {
    console.error('✗ Error clearing data:', error.message);
    throw error;
  }
};

export default { connectDB, disconnectDB, getNextId, clearAllData };
