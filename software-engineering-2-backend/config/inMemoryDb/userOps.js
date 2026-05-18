/**
 * @fileoverview User Operations - In-Memory Database
 * @description Database operations for users, authentication, preferences, and settings.
 * Provides CRUD operations for the in-memory database implementation.
 * 
 * @module config/inMemoryDb/userOps
 * @requires ../seedData
 */

import data from '../seedData.js';

/**
 * Finds a user by their ID.
 * @param {number} userId - The user ID to search for
 * @returns {Promise<Object|null>} User object or null if not found
 */
// User and Preference Profile API
export async function findUserById(userId) {
    return data.users.find(u => u.userId === userId) || null;
}

export async function getPreferenceProfiles(userId) {
    return data.preferenceProfiles.filter(p => p.userId === userId);
}

export async function getPreferenceProfile(userId, profileId) {
    return data.preferenceProfiles.find(p => p.userId === userId && p.profileId === profileId) || null;
}

export async function addPreferenceProfile(profile) {
    profile.profileId = data.counters.profileId++;
    data.preferenceProfiles.push(profile);
    return profile;
}

export async function updatePreferenceProfile(userId, profileId, update) {
    const idx = data.preferenceProfiles.findIndex(p => p.userId === userId && p.profileId === profileId);
    if (idx === -1) return null;
    data.preferenceProfiles[idx] = { ...data.preferenceProfiles[idx], ...update };
    return data.preferenceProfiles[idx];
}

export async function deletePreferenceProfile(userId, profileId) {
    const idx = data.preferenceProfiles.findIndex(p => p.userId === userId && p.profileId === profileId);
    if (idx === -1) return false;
    data.preferenceProfiles.splice(idx, 1);
    return true;
}

// Auth functions
export async function findUserByEmail(email) {
    return data.users.find(u => u.email === email) || null;
}

export async function createUser(userData) {
    const newUser = {
        ...userData,
        userId: data.counters.userId++,
        createdAt: new Date().toISOString()
    };
    data.users.push(newUser);
    return newUser;
}

export async function updateUserById(userId, update) {
    const idx = data.users.findIndex(u => u.userId === userId);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...update };
    return data.users[idx];
}

export async function deleteUserById(userId) {
    const idx = data.users.findIndex(u => u.userId === userId);
    if (idx === -1) return false;
    data.users.splice(idx, 1);
    return true;
}

export async function getAllUsers() {
    return data.users;
}

// Settings functions
export async function getSettings(userId) {
    let settings = data.settings.find(s => s.userId === userId);
    if (!settings) {
        settings = {
            userId: userId,
            preferredLanguage: 'ENGLISH',
            accessibilitySettings: [],
            privacySettings: [],
            userAgreementAccepted: true
        };
        data.settings.push(settings);
    }
    return settings;
}

export async function updateSettings(userId, settingsData) {
    const idx = data.settings.findIndex(s => s.userId === userId);
    if (idx === -1) {
        const newSettings = { userId, ...settingsData };
        data.settings.push(newSettings);
        return newSettings;
    }
    data.settings[idx] = { ...data.settings[idx], ...settingsData };
    return data.settings[idx];
}
