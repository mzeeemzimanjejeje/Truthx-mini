const { downloadContentFromMessage, generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const { PassThrough } = require('stream');

async function setGroupStatusCommand(sock, chatId, msg) {
    const ffmpeg = require('fluent-ffmpeg');
    try {
        const isDM = !chatId.endsWith('@g.us');

        const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Strip everything up to and including the command word, leaving the args
        let afterCmd = messageText.replace(/^.*?(togroupstatus|tostatus|groupstatus|swgc)\s*/i, '').trim();

        // ── Resolve target group JID ─────────────────────────────────────────────
        // Supports three syntaxes from any chat (DM or group):
        //   .togroupstatus {120363395198201127@g.us} caption
        //   .tostatus 120363395198201127@g.us caption
        //   .tostatus caption              (in-group only — posts to current group)

        let targetJid = chatId;

        // Check for {jid} curly-brace syntax first (works from any chat)
        const _braceMatch = afterCmd.match(/^\{([^}]+)\}\s*/);
        if (_braceMatch) {
            const _token = _braceMatch[1].trim();
            targetJid = _token.endsWith('@g.us') || _token.includes('@lid')
                ? _token
                : `${_token.replace(/\D/g, '')}@g.us`;
            afterCmd = afterCmd.slice(_braceMatch[0].length).trim();
        } else if (isDM) {
            // DM without braces — first token must be the group JID
            const firstToken = afterCmd.split(/\s+/)[0] || '';
            if (!firstToken) {
                await sock.sendMessage(chatId, {
                    text: [
                        '❌ *Usage (from DM or any group):*',
                        '',
                        '*.togroupstatus {group_id} your message*',
                        '',
                        '*Examples:*',
                        '• `.togroupstatus {120363395198201127@g.us} Hello everyone!`',
                        '• `.tostatus 120363395198201127@g.us Hello everyone!`',
                        '',
                        'Or reply to media and include the group ID.',
                        '',
                        '💡 Use *.fetchgroups* to get all group IDs.'
                    ].join('\n')
                }, { quoted: msg });
                return;
            }
            if (firstToken.endsWith('@g.us') || firstToken.includes('@lid')) {
                targetJid = firstToken;
            } else {
                const digits = firstToken.replace(/\D/g, '');
                if (!digits) {
                    await sock.sendMessage(chatId, {
                        text: `❌ Invalid group ID: \`${firstToken}\`\nUse the full JID ending in @g.us or wrap it in braces: {group_id}.`
                    }, { quoted: msg });
                    return;
                }
                targetJid = `${digits}@g.us`;
            }
            afterCmd = afterCmd.slice(firstToken.length).trim();
        }

        // ── Resolve group name for confirmation message ───────────────────────────
        let _groupName = targetJid.split('@')[0];
        try {
            const { getGroups } = require('./lib/groupTracker');
            const _tracked = getGroups();
            if (_tracked[targetJid]?.name) _groupName = _tracked[targetJid].name;
        } catch (_) {}
        if (_groupName === targetJid.split('@')[0]) {
            // Tracker miss — try live metadata
            try {
                const _meta = await Promise.race([
                    sock.groupMetadata(targetJid),
                    new Promise((_, r) => setTimeout(() => r(null), 5000))
                ]).catch(() => null);
                if (_meta?.subject) _groupName = _meta.subject;
            } catch (_) {}
        }

        const caption = afterCmd;

        let payload = {};
        let mediaType = 'Text';

        if (quotedMessage) {
            if (quotedMessage.imageMessage) {
                const stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                payload = { image: buffer, caption: caption || '' };
                mediaType = 'Image';

            } else if (quotedMessage.videoMessage) {
                const stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                payload = { video: buffer, caption: caption || '' };
                mediaType = 'Video';

            } else if (quotedMessage.audioMessage) {
                const stream = await downloadContentFromMessage(quotedMessage.audioMessage, 'audio');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                const audioVn = await toVN(buffer);
                payload = { audio: audioVn, mimetype: 'audio/ogg; codecs=opus', ptt: true };
                mediaType = 'Audio';

            } else if (quotedMessage.stickerMessage) {
                const stream = await downloadContentFromMessage(quotedMessage.stickerMessage, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                payload = { sticker: buffer };
                mediaType = 'Sticker';

            } else {
                const quotedText = quotedMessage.conversation ||
                                   quotedMessage.extendedTextMessage?.text || '';
                payload = { text: caption || quotedText };
                mediaType = 'Text';
            }
        } else {
            if (!caption) {
                const hint = isDM
                    ? '❌ Add text after the group JID, or reply to media.\nExample: `.tostatus 1234567890@g.us Hello everyone!`'
                    : '❌ Reply to a photo/video/audio/sticker/text with this command, or add text after it.\nExample: `.tostatus Hello everyone!`';
                await sock.sendMessage(chatId, { text: hint }, { quoted: msg });
                return;
            }
            payload = { text: caption };
        }

        await sendGroupStatus(sock, targetJid, payload);

        await sock.sendMessage(chatId, {
            text: `✅ Status posted in *${_groupName}*`
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in tostatus command:', error);
        await sock.sendMessage(chatId, { text: `❌ Failed: ${error.message}` });
    }
}

async function sendGroupStatus(conn, jid, content) {
    const inside = await generateWAMessageContent(content, { upload: conn.waUploadToServer });
    const messageSecret = crypto.randomBytes(32);

    const m = generateWAMessageFromContent(jid, {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
    }, {});

    await conn.relayMessage(jid, m.message, { messageId: m.key.id });
    return m;
}

async function toVN(inputBuffer) {
    return new Promise((resolve, reject) => {
        const inStream = new PassThrough();
        inStream.end(inputBuffer);
        const outStream = new PassThrough();
        const chunks = [];

        ffmpeg(inStream)
            .noVideo()
            .audioCodec('libopus')
            .format('ogg')
            .audioBitrate('48k')
            .audioChannels(1)
            .audioFrequency(48000)
            .on('error', reject)
            .on('end', () => resolve(Buffer.concat(chunks)))
            .pipe(outStream, { end: true });

        outStream.on('data', chunk => chunks.push(chunk));
    });
}

module.exports = setGroupStatusCommand;
