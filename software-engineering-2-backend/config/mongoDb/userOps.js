/**
 * User Operations - MongoDB
 * User CRUD, auth, preferences, and settings operations
 */

import models from '../../models/index.js';

// User and Preference Profile API
export async function findUserById(userId) {
    return await models.User.findOne({ userId });
}

export async function getPreferenceProfiles(userId) {
    return await models.PreferenceProfile.find({ userId });
}

export async function addPreferenceProfile(profile) {
    const last = await models.PreferenceProfile.findOne({}, {}, { sort: { profileId: -1 } });
    const profileId = last ? last.profileId + 1 : 1;
    const doc = new models.PreferenceProfile({ ...profile, profileId });
    await doc.save();
    return doc;
}

export async function updatePreferenceProfile(userId, profileId, update) {
    const doc = await models.PreferenceProfile.findOneAndUpdate(
        { userId, profileId },
        { $set: update, $currentDate: { updatedAt: true } },
        { new: true }
    );
    return doc;
}

export async function deletePreferenceProfile(userId, profileId) {
    const result = await models.PreferenceProfile.deleteOne({ userId, profileId });
    return result.deletedCount > 0;
}

// Auth functions
export async function findUserByEmail(email) {
    return await models.User.findOne({ email });
}

export async function createUser(userData) {
    const last = await models.User.findOne({}, {}, { sort: { userId: -1 } });
    const userId = last ? last.userId + 1 : 1;
    const doc = new models.User({ ...userData, userId });
    await doc.save();
    return doc;
}

export async function updateUserById(userId, update) {
    const doc = await models.User.findOneAndUpdate(
        { userId },
        { $set: update },
        { new: true }
    );
    return doc;
}

// Settings functions
export async function getSettings(userId) {
    let settings = await models.Settings.findOne({ userId });
    if (!settings) {
        settings = new models.Settings({
            userId,
            preferredLanguage: 'ENGLISH',
            accessibilitySettings: [],
            privacySettings: [],
            userAgreementAccepted: true
        });
        await settings.save();
    }
    return settings;
}

export async function updateSettings(userId, settingsData) {
    const doc = await models.Settings.findOneAndUpdate(
        { userId },
        { $set: settingsData },
        { new: true, upsert: true }
    );
    return doc;
}
