const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '',
            newsletterName: 'TRUTH MD',
            serverMessageId: -1
        }
    }
};

// Paths for data storage
const dataDir = path.join(__dirname, '../data');
const welcomePath = path.join(dataDir, 'welcome.json');
const goodbyePath = path.join(dataDir, 'goodbye.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Default messages
const defaultMessages = {
    welcome: '✨ Welcome {user} to {group}! You are member #{count} 🎉',
    goodbye: '😢 Goodbye {user}! We\'re now {count} members in {group}.'
};

// Load settings from file
function loadSettings(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`Error loading settings from ${filePath}:`, error);
    }
    return {};
}

// Save settings to file
function saveSettings(filePath, settings) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving settings to ${filePath}:`, error);
        return false;
    }
}

// Get group settings
function getGroupSettings(type, groupId) {
    const filePath = type === 'welcome' ? welcomePath : goodbyePath;
    const settings = loadSettings(filePath);
    return settings[groupId] || { 
        enabled: false, 
        message: null,
        type: type
    };
}

// Update group settings
function updateGroupSettings(type, groupId, newSettings) {
    const filePath = type === 'welcome' ? welcomePath : goodbyePath;
    const settings = loadSettings(filePath);
    settings[groupId] = newSettings;
    return saveSettings(filePath, settings);
}

// Format message with placeholders
function formatMessage(message, user, groupName, memberCount, type = 'welcome') {
    if (!message || typeof message !== 'string') {
        message = type === 'welcome' ? defaultMessages.welcome : defaultMessages.goodbye;
    }
    // Ensure user is a plain JID string
    const userJid = typeof user === 'string' ? user : (user?.id || user?.jid || '');
    const userNum = userJid.split('@')[0] || 'member';

    return message
        .replace(/{user}/g, `@${userNum}`)
        .replace(/{group}/g, groupName || 'the group')
        .replace(/{count}/g, memberCount || 0)
        .replace(/{mention}/g, `@${userNum}`)
        .replace(/{username}/g, userNum)
        .replace(/{total}/g, memberCount || 0);
}

// =================== WELCOME COMMANDS ===================

async function welcomeCommand(sock, chatId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can use this command!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const groupSettings = getGroupSettings('welcome', chatId);
        const cmd = (userMessage || '').trim().toLowerCase();

        if (cmd.endsWith('welcome on')) {
            groupSettings.enabled = true;
        } else if (cmd.endsWith('welcome off')) {
            groupSettings.enabled = false;
        } else {
            // Plain .welcome — show status
            const status = groupSettings.enabled ? '✅ ON' : '❌ OFF';
            const customMsg = groupSettings.message ? `\n\n📝 Custom message set: "${groupSettings.message}"` : '\n\n📝 No custom message — using default.';
            await sock.sendMessage(chatId, {
                text: `🌟 *Welcome Messages*\nStatus: *${status}*${customMsg}\n\n📌 Commands:\n• *.welcome on* — Turn on\n• *.welcome off* — Turn off\n• *.setwelcome <msg>* — Set custom message\n• *.resetwelcome* — Reset to default`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        updateGroupSettings('welcome', chatId, groupSettings);
        
        await sock.sendMessage(chatId, { 
            text: `✅ Welcome messages *${groupSettings.enabled ? 'TURNED ON ✅' : 'TURNED OFF ❌'}* for this group.`, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in welcome command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to update welcome messages.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

async function setwelcomeCommand(sock, chatId, senderId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can set welcome messages!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const welcomeText = userMessage.replace(/^\.setwelcome\s+/i, '').trim();
        
        if (!welcomeText) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide a welcome message!\n\n📝 Example: .setwelcome Welcome {user} to {group}! 🎉\n\n📌 Placeholders:\n• {user} - mentions the new member\n• {group} - group name\n• {count} - member count\n• {mention} - same as {user}\n• {username} - user's number\n• {total} - total members`, 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (welcomeText.length > 500) {
            await sock.sendMessage(chatId, { 
                text: '❌ Welcome message is too long! Maximum 500 characters.', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const groupSettings = getGroupSettings('welcome', chatId);
        groupSettings.message = welcomeText;
        groupSettings.enabled = true;
        
        updateGroupSettings('welcome', chatId, groupSettings);
        
        // Get group info for preview
        const groupMetadata = await sock.groupMetadata(chatId);
        const memberCount = groupMetadata.participants.length;
        const groupName = groupMetadata.subject || 'Group';
        
        const preview = formatMessage(welcomeText, senderId, groupName, memberCount, 'welcome');
        
        await sock.sendMessage(chatId, { 
            text: `✅ Custom welcome message set successfully!\n\n📝 Preview:\n${preview}\n\n📌 Placeholders:\n• {user} - mentions new member\n• {group} - group name\n• {count} - member count\n• {mention} - same as {user}\n• {username} - user's number\n• {total} - total members`, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in setwelcome command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to set welcome message.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

// =================== GOODBYE COMMANDS ===================

async function goodbyeCommand(sock, chatId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can use this command!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const groupSettings = getGroupSettings('goodbye', chatId);
        const cmd = (userMessage || '').trim().toLowerCase();

        if (cmd.endsWith('goodbye on')) {
            groupSettings.enabled = true;
        } else if (cmd.endsWith('goodbye off')) {
            groupSettings.enabled = false;
        } else {
            // Plain .goodbye — show status
            const status = groupSettings.enabled ? '✅ ON' : '❌ OFF';
            const customMsg = groupSettings.message ? `\n\n📝 Custom message set: "${groupSettings.message}"` : '\n\n📝 No custom message — using default.';
            await sock.sendMessage(chatId, {
                text: `👋 *Goodbye Messages*\nStatus: *${status}*${customMsg}\n\n📌 Commands:\n• *.goodbye on* — Turn on\n• *.goodbye off* — Turn off\n• *.setgoodbye <msg>* — Set custom message\n• *.resetgoodbye* — Reset to default`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        updateGroupSettings('goodbye', chatId, groupSettings);
        
        await sock.sendMessage(chatId, { 
            text: `✅ Goodbye messages *${groupSettings.enabled ? 'TURNED ON ✅' : 'TURNED OFF ❌'}* for this group.`, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in goodbye command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to toggle goodbye messages.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

async function setgoodbyeCommand(sock, chatId, senderId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can set goodbye messages!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const goodbyeText = userMessage.replace(/^\.setgoodbye\s+/i, '').trim();
        
        if (!goodbyeText) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide a goodbye message!\n\n📝 Example: .setgoodbye Goodbye {user}! We'll miss you in {group} 😢\n\n📌 Placeholders:\n• {user} - mentions the leaving member\n• {group} - group name\n• {count} - member count\n• {mention} - same as {user}\n• {username} - user's number\n• {total} - total members`, 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (goodbyeText.length > 500) {
            await sock.sendMessage(chatId, { 
                text: '❌ Goodbye message is too long! Maximum 500 characters.', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const groupSettings = getGroupSettings('goodbye', chatId);
        groupSettings.message = goodbyeText;
        groupSettings.enabled = true;
        
        updateGroupSettings('goodbye', chatId, groupSettings);
        
        // Get group info for preview
        const groupMetadata = await sock.groupMetadata(chatId);
        const memberCount = groupMetadata.participants.length;
        const groupName = groupMetadata.subject || 'Group';
        
        const preview = formatMessage(goodbyeText, senderId, groupName, memberCount, 'goodbye');
        
        await sock.sendMessage(chatId, { 
            text: `✅ Custom goodbye message set successfully!\n\n📝 Preview:\n${preview}\n\n📌 Placeholders:\n• {user} - mentions leaving member\n• {group} - group name\n• {count} - member count\n• {mention} - same as {user}\n• {username} - user's number\n• {total} - total members`, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in setgoodbye command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to set goodbye message.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

// =================== INFO/UTILITY COMMANDS ===================

async function showsettingsCommand(sock, chatId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can view these settings!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const type = userMessage.includes('welcome') ? 'welcome' : 'goodbye';
        const groupSettings = getGroupSettings(type, chatId);
        const groupMetadata = await sock.groupMetadata(chatId);
        const groupName = groupMetadata.subject || 'Group';
        const memberCount = groupMetadata.participants.length;
        
        let response = `📋 ${type.toUpperCase()} SETTINGS for "${groupName}"\n`;
        response += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        response += `🔘 Status: ${groupSettings.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n`;
        
        if (groupSettings.message) {
            const preview = formatMessage(groupSettings.message, message.key.remoteJid, groupName, memberCount, type);
            response += `📝 Custom Message:\n"${groupSettings.message}"\n\n`;
            response += `👁️ Preview:\n${preview}\n\n`;
        } else {
            const defaultMsg = type === 'welcome' ? defaultMessages.welcome : defaultMessages.goodbye;
            const preview = formatMessage(null, message.key.remoteJid, groupName, memberCount, type);
            response += `📝 Message: Using default\n"${defaultMsg}"\n\n`;
            response += `👁️ Preview:\n${preview}\n\n`;
        }
        
        response += `📌 Available Placeholders:\n`;
        response += `• {user} - Mentions the member\n`;
        response += `• {group} - Group name (${groupName})\n`;
        response += `• {count} - Member count (${memberCount})\n`;
        response += `• {mention} - Same as {user}\n`;
        response += `• {username} - User's number\n`;
        response += `• {total} - Same as {count}\n\n`;
        
        response += `🎮 Commands:\n`;
        if (type === 'welcome') {
            response += `• .welcome - Toggle welcome messages\n`;
            response += `• .setwelcome <message> - Set custom message\n`;
            response += `• .resetwelcome - Reset to default\n`;
        } else {
            response += `• .goodbye - Toggle goodbye messages\n`;
            response += `• .setgoodbye <message> - Set custom message\n`;
            response += `• .resetgoodbye - Reset to default\n`;
        }
        
        await sock.sendMessage(chatId, { 
            text: response, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in showsettings command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to get settings.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

async function resetCommand(sock, chatId, senderId, message, userMessage, senderIsSudo = false) {
    try {
        const isGroup = chatId.endsWith('@g.us');
        if (!isGroup) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used in groups!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner or sudos can reset messages!', 
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        const type = userMessage.includes('welcome') ? 'welcome' : 'goodbye';
        const groupSettings = getGroupSettings(type, chatId);
        
        if (!groupSettings.message) {
            await sock.sendMessage(chatId, { 
                text: `⚠️ No custom ${type} message to reset. Already using default.`, 
                ...channelInfo 
            }, { quoted: message });
            return;
        }
        
        groupSettings.message = null;
        updateGroupSettings(type, chatId, groupSettings);
        
        await sock.sendMessage(chatId, { 
            text: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} message has been reset to default.`, 
            ...channelInfo 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in reset command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Failed to reset message.', 
            ...channelInfo 
        }, { quoted: message });
    }
}

// =================== EVENT HANDLERS ===================

async function handleJoinEvent(sock, groupId, participants) {
    try {
        const groupSettings = getGroupSettings('welcome', groupId);
        if (!groupSettings.enabled) return;
        if (!participants?.length) return;

        let memberCount = 0, groupName = 'the group';
        try {
            const meta = await Promise.race([
                sock.groupMetadata(groupId),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
            ]);
            memberCount = meta.participants.length;
            groupName = meta.subject || 'the group';
        } catch (_) {}

        for (const participant of participants) {
            try {
                const userJid = typeof participant === 'string' ? participant : (participant?.id || '');
                if (!userJid) continue;

                const welcomeMessage = formatMessage(
                    groupSettings.message, userJid, groupName, memberCount, 'welcome'
                );

                // Try to fetch profile picture
                let ppUrl = null;
                try {
                    ppUrl = await Promise.race([
                        sock.profilePictureUrl(userJid, 'image'),
                        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                    ]);
                } catch (_) {}

                // Fallback to group picture if participant has no profile picture
                if (!ppUrl) {
                    try {
                        ppUrl = await Promise.race([
                            sock.profilePictureUrl(groupId, 'image'),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                        ]);
                    } catch (_) {}
                }

                if (ppUrl) {
                    let imgBuffer = null;
                    try {
                        const axios = require('axios');
                        const res = await Promise.race([
                            axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 8000 }),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
                        ]);
                        imgBuffer = Buffer.from(res.data);
                    } catch (_) {}

                    if (imgBuffer) {
                        await sock.sendMessage(groupId, {
                            image: imgBuffer,
                            caption: welcomeMessage,
                            mentions: [userJid]
                        });
                    } else {
                        await sock.sendMessage(groupId, { text: welcomeMessage, mentions: [userJid] });
                    }
                } else {
                    await sock.sendMessage(groupId, { text: welcomeMessage, mentions: [userJid] });
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
                console.error('Error sending welcome to', participant, e.message);
            }
        }
    } catch (error) {
        console.error('Error in handleJoinEvent:', error.message);
    }
}

async function handleLeaveEvent(sock, groupId, participants) {
    try {
        const groupSettings = getGroupSettings('goodbye', groupId);
        if (!groupSettings.enabled) return;
        if (!participants?.length) return;

        let memberCount = 0, groupName = 'the group';
        try {
            const meta = await Promise.race([
                sock.groupMetadata(groupId),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
            ]);
            memberCount = meta.participants.length;
            groupName = meta.subject || 'the group';
        } catch (_) {}

        for (const participant of participants) {
            try {
                const userJid = typeof participant === 'string' ? participant : (participant?.id || '');
                if (!userJid) continue;

                const goodbyeMessage = formatMessage(
                    groupSettings.message, userJid, groupName, memberCount, 'goodbye'
                );

                const axios = require('axios');

                // Try user's profile picture first, always fall back to group picture
                let ppUrl = null;
                try {
                    ppUrl = await Promise.race([
                        sock.profilePictureUrl(userJid, 'image'),
                        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                    ]);
                } catch (_) {}

                if (!ppUrl) {
                    try {
                        ppUrl = await Promise.race([
                            sock.profilePictureUrl(groupId, 'image'),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                        ]);
                    } catch (_) {}
                }

                // Try to download whichever URL we got; retry with group pic if user pic download fails
                let imgBuffer = null;
                if (ppUrl) {
                    try {
                        const res = await Promise.race([
                            axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 8000 }),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
                        ]);
                        imgBuffer = Buffer.from(res.data);
                    } catch (_) {
                        // User pic download failed — try group pic
                        try {
                            const groupPpUrl = await Promise.race([
                                sock.profilePictureUrl(groupId, 'image'),
                                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                            ]);
                            const res = await Promise.race([
                                axios.get(groupPpUrl, { responseType: 'arraybuffer', timeout: 8000 }),
                                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
                            ]);
                            imgBuffer = Buffer.from(res.data);
                        } catch (_) {}
                    }
                } else {
                    // No URL at all — fetch group pic directly
                    try {
                        const groupPpUrl = await Promise.race([
                            sock.profilePictureUrl(groupId, 'image'),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                        ]);
                        const res = await Promise.race([
                            axios.get(groupPpUrl, { responseType: 'arraybuffer', timeout: 8000 }),
                            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))
                        ]);
                        imgBuffer = Buffer.from(res.data);
                    } catch (_) {}
                }

                await sock.sendMessage(groupId, imgBuffer
                    ? { image: imgBuffer, caption: goodbyeMessage, mentions: [userJid] }
                    : { text: goodbyeMessage, mentions: [userJid] }
                );

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
                console.error('Error sending goodbye to', participant, e.message);
            }
        }
    } catch (error) {
        console.error('Error in handleLeaveEvent:', error.message);
    }
}

// =================== EXPORTS ===================

module.exports = {
    // Command functions
    welcomeCommand,
    goodbyeCommand,
    setwelcomeCommand,
    setgoodbyeCommand,
    showsettingsCommand,
    resetCommand,
    
    // Event handlers
    handleJoinEvent,
    handleLeaveEvent,
    
    // Helper functions (optional exports)
    getGroupSettings,
    updateGroupSettings,
    formatMessage
};
