const settings = require("../settings");
const os = require("os");
const path = require("path");
const fs = require("fs");

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

async function tutorialCommand(sock, chatId, message) {
    // Build message outside try so it's available in catch too
    const userName = message.pushName || "User";
    const botUptime = runtime(process.uptime());
    const ownerLabel = settings.botOwner || settings.ownerName || "Xhyper Tech";

    const uptimeMessage =
        `👋 \`Hello ${userName}, here is the tutorial videos\`\n\n` +
        `*This ${settings.botName || "TRUTH MD"} WhatsApp Bot tutorial — easy to deploy*\n\n` +
        `*github workflows:* https://youtu.be/2HU2okH8HL4?si=l2JG1EbML0MhfLWg\n` +
        `*katabump video:* https://youtu.be/uiTIc6yPZPc?si=CMk5G9OJY3WHW2A2\n` +
        `*TRUTH-MD Host video:* https://youtu.be/ilaDlfd39n0?si=63XKx8q4RHULXQBF\n` +
        `*bothosting video:* ~coming soon~\n` +
        `*heroku video:* ~coming soon~\n` +
        `*${settings.botName || "TRUTH MD"} Online*\n\n` +
        `*🧚Follow our channel:* https://whatsapp.com/channel/0029VbCafMZBA1f42UxcYW0D\n\n` +
        `> Powered by COURTNEY 🦅`;

    try {
        await sock.sendMessage(chatId, {
            react: { text: "📸", key: message.key }
        });

        const imagePath = path.resolve(__dirname, "../assets/IMG-20250819-WA0001(1).jpg");

        if (fs.existsSync(imagePath)) {
            await sock.sendMessage(chatId, {
                image: fs.readFileSync(imagePath),
                caption: uptimeMessage
            }, { quoted: message });
        } else {
            // Fallback to text if image file missing
            await sock.sendMessage(chatId, { text: uptimeMessage }, { quoted: message });
        }

    } catch (error) {
        console.error("Error in tutorial command:", error);
        try {
            await sock.sendMessage(chatId, { text: uptimeMessage }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: "⚠️", key: message.key } });
        } catch {}
    }
}

module.exports = tutorialCommand;
