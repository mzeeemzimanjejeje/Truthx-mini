const path = require('path');
const fs = require('fs');
const { getUserSetting, setUserSetting, deleteUserSetting, getAllUserSettings } = require('./userSettings');
const configdb = require('./configdb');

/**
 * SessionSettings Manager
 * 
 * This module provides isolated settings for each connected bot instance.
 * It uses the bot's own WhatsApp JID (or phone number) as the unique identifier.
 * 
 * It acts as a bridge:
 * 1. For global-like settings (prefix, botName, etc.), it stores them per-bot-JID.
 * 2. It provides fallback to the original global settings for backward compatibility.
 */

/**
 * Get a setting for a specific bot instance
 * @param {string} botJid - The JID of the bot instance (e.g., "254123456789@s.whatsapp.net")
 * @param {string} key - The setting key (e.g., "PREFIX")
 * @param {any} defaultValue - Default value if not set
 * @returns {any}
 */
function getSessionSetting(botJid, key, defaultValue = null) {
    if (!botJid) return configdb.getConfig(key, defaultValue);
    
    // Normalize JID to phone number for cleaner storage keys if preferred, 
    // but JID is more unique for multi-tenant.
    const id = botJid.split('@')[0];
    
    // Try to get from per-bot storage (using userSettings backend)
    const val = getUserSetting(`bot:${id}`, key);
    
    if (val !== null && val !== undefined) return val;
    
    // Fallback to global configdb
    return configdb.getConfig(key, defaultValue);
}

/**
 * Set a setting for a specific bot instance
 * @param {string} botJid - The JID of the bot instance
 * @param {string} key - The setting key
 * @param {any} value - The value to set
 */
function setSessionSetting(botJid, key, value) {
    if (!botJid) return configdb.setConfig(key, value);
    
    const id = botJid.split('@')[0];
    return setUserSetting(`bot:${id}`, key, value);
}

/**
 * Delete a setting for a specific bot instance
 * @param {string} botJid 
 * @param {string} key 
 */
function deleteSessionSetting(botJid, key) {
    if (!botJid) return configdb.deleteConfig(key);
    
    const id = botJid.split('@')[0];
    return deleteUserSetting(`bot:${id}`, key);
}

/**
 * Get all settings for a specific bot instance
 * @param {string} botJid 
 */
function getAllSessionSettings(botJid) {
    if (!botJid) return {};
    const id = botJid.split('@')[0];
    return getAllUserSettings(`bot:${id}`);
}

/**
 * Helper to get bot name for a specific instance
 */
function getBotName(botJid) {
    return getSessionSetting(botJid, 'BOTNAME', 'TRUTH MD');
}

/**
 * Helper to get prefix for a specific instance
 */
function getPrefix(botJid) {
    const p = getSessionSetting(botJid, 'PREFIX', '.');
    return p === 'none' ? '' : p;
}

module.exports = {
    getSessionSetting,
    setSessionSetting,
    deleteSessionSetting,
    getAllSessionSettings,
    getBotName,
    getPrefix
};
