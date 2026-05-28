const { exec } = require('child_process');
const path = require('path');

async function pushPublicCommand(sock, chatId, message, args, isOwner) {
    if (!isOwner) {
        return sock.sendMessage(chatId, { text: '❌ This command is for the bot owner only.' }, { quoted: message });
    }

    const publicRepo = process.env.PUBLIC_REPO || 'Courtney250/TRUTH-MD';
    const token = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();

    if (!token) {
        return sock.sendMessage(chatId, {
            text: `❌ GITHUB_PERSONAL_ACCESS_TOKEN is not set in your environment secrets.`
        }, { quoted: message });
    }

    await sock.sendMessage(chatId, {
        text: `⏳ Syncing bot files to *${publicRepo}*...\nThis may take a minute.`
    }, { quoted: message });

    const scriptPath = path.join(process.cwd(), 'push-public.js');

    const env = {
        ...process.env,
        COURTNEY_GITHUB_TOKEN: token,
        PUBLIC_REPO: publicRepo
    };

    exec(`node "${scriptPath}"`, { env, timeout: 120000 }, async (err, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');

        const pushed  = (output.match(/✅/g) || []).length;
        const failed  = (output.match(/⚠️/g) || []).length;
        const success = !err || err.code === 0;

        let reply = success
            ? `✅ *Sync complete!*\n\n`
            : `⚠️ *Sync finished with errors*\n\n`;

        reply += `📦 Pushed: *${pushed}* files\n`;
        if (failed > 0) reply += `⚠️ Failed: *${failed}* files\n`;
        reply += `\n🔗 https://github.com/${publicRepo}`;

        if (!success && failed === 0) {
            reply += `\n\n❌ Error: ${err?.message || 'Unknown error'}`;
        }

        await sock.sendMessage(chatId, { text: reply }, { quoted: message });
    });
}

module.exports = pushPublicCommand;
