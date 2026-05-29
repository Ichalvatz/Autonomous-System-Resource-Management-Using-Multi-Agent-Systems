/**
 * Counter Model
 * Mongoose schema for auto-increment IDs
 */

import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 }
});

export default mongoose.model('Counter', counterSchema);
