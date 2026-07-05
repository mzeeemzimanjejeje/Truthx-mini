/*━━━━━━━━━━━━━━━━━━━━*/
// Raw Output Suppression Code
/*━━━━━━━━━━━━━━━━━━━━*/

const originalWrite = process.stdout.write;
process.stdout.write = function (chunk, encoding, callback) {
    const message = chunk.toString();

    if (message.includes('Closing session: SessionEntry') || message.includes('SessionEntry {')) {
        return;
    }

    return originalWrite.apply(this, arguments);
};

const originalWriteError = process.stderr.write;
process.stderr.write = function (chunk, encoding, callback) {
    const message = chunk.toString();
    if (message.includes('Closing session: SessionEntry')) {
        return;
    }
    return originalWriteError.apply(this, arguments);
};

const originalLog = console.log;
console.log = function (message, ...optionalParams) {

    if (typeof message === 'string' && message.startsWith('Closing session: SessionEntry')) {
        return;
    }
    
    originalLog.apply(console, [message, ...optionalParams]);
};

//this code is to avoid preKeyCount bound coded by Courtney

/*━━━━━━━━━━━━━━━━━━━━*/
// -----Core imports first-----
/*━━━━━━━━━━━━━━━━━━━━*/
const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const chalk = require('chalk');
const { checkRateLimit } = require('./lib/ratelimit');
const _DISABLED = () => { throw new Error('FEATURE_DISABLED'); };
const yts = (...a) => { try { return require('yt-search')(...a); } catch(_) { throw new Error('FEATURE_DISABLED'); } };
Object.defineProperty(yts, '__lazy', { value: true });
const ytdl = new Proxy(_DISABLED, { apply() { throw new Error('FEATURE_DISABLED'); }, get(_, p) { try { return require('ytdl-core')[p]; } catch(_) { return _DISABLED; } } });
const ffmpeg = new Proxy(_DISABLED, { apply() { throw new Error('FEATURE_DISABLED'); }, get(_, p) { try { return require('fluent-ffmpeg')[p]; } catch(_) { return _DISABLED; } } });
const { fetchBuffer } = require('./lib/myfunc');
const fs = require('fs');
const fetch = globalThis.fetch;
const path = require('path');
const axios = require('axios');
const { jidDecode } = require('@whiskeysockets/baileys');
const { updateLidMap, resolveToPhoneJid, isSudo } = require('./lib/index');
const isAdmin = require('./lib/isAdmin');
const { Antilink } = require('./lib/antilink');
function safeImport(p) {
    try {
        return require(p);
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') return {};
        console.error(`Failed to import ${p}: ${e.message}`);
        return {};
    }
}
function lazyCmd(p) {
    let m;
    return function(...a) { if (!m) m = require(p); return m(...a); };
}
function lazyCmdNamed(p) {
    let m;
    return new Proxy({}, { get(_, k) { if (!m) m = require(p); return m[k]; } });
}

const { tictactoeCommand, handleTicTacToeMove } = safeImport('./commands/tictactoe');
const { getConfig } = require('./lib/configdb');
const { getPrefix, getSessionSetting } = require('./lib/sessionSettings');

/*━━━━━━━━━━━━━━━━━━━━*/
// -----Command imports -Handlers
/*━━━━━━━━━━━━━━━━━━━━*/
const { 
   autotypingCommand,
   isAutotypingEnabled,
   handleAutotypingForMessage,
   handleAutotypingForCommand, 
   showTypingAfterCommand
 } = safeImport('./commands/autotyping');

const {
   autorecordingCommand,
   isAutorecordingEnabled,
   handleAutorecordingForMessage,
   handleAutorecordingForCommand,
   showRecordingAfterCommand
 } = safeImport('./commands/autorecording');

const {
    autoreadReceiptsCommand,
    applyReadReceiptsPrivacy,
    getReadReceiptsSetting
} = safeImport('./commands/autoreadreceipts');

const {
  handleAntieditCommand,
  handleMessageEdit,
  storeMessage: storeEditMessage
} = safeImport('./commands/antiedit');


 const {
  getPrefix, 
  handleSetPrefixCommand 
  } = safeImport('./commands/setprefix');

const {
  getOwnerName, 
  handleSetOwnerCommand 
} = safeImport('./commands/setowner');

const {
  getBotName, 
  handleSetBotCommand 
} = safeImport('./commands/setbot');

// Add this with your other owner-related imports
const {
  getOwnerNumber,
  handleSetOwnerNumberCommand
} = safeImport('./commands/setownernumber');
 
const {
 autoreadCommand,
 isAutoreadEnabled, 
 handleAutoread 
 } = safeImport('./commands/autoread');
 
 const { 
    incrementMessageCount, 
    topMembers, 
    listOnlineCommand, 
    listOfflineCommand,
    handleUserActivity,
    updateUserActivity,
    getOnlineMembers 
} = safeImport('./commands/topmembers');
 
 const { 
 setGroupDescription, 
 setGroupName, 
 setGroupPhoto 
 } = safeImport('./commands/groupmanage');

const { createGroupCommand } = safeImport('./commands/creategroup');

const { 
 handleAntilinkCommand, 
 handleLinkDetection 
 } = safeImport('./commands/antilink');

const { 
 handleAntitagCommand, 
 handleTagDetection
 } = safeImport('./commands/antitag');
 
const { 
 handleMentionDetection,
 mentionToggleCommand,
 setMentionCommand
 } = safeImport('./commands/mention');
 
const { 
 handleAntiBadwordCommand,
 handleBadwordDetection
  } = require('./lib/antibadword');

const { 
    welcomeCommand, 
    goodbyeCommand, 
    setwelcomeCommand, 
    setgoodbyeCommand, 
    showsettingsCommand, 
    resetCommand,
    handleJoinEvent,
    handleLeaveEvent 
} = safeImport('./commands/welcomemodule');
  
const {
 handleAntideleteCommand,
 handleMessageRevocation,
 storeMessage } = safeImport('./commands/antidelete');
 
const {
 anticallCommand,
 setanticallmsgCommand,
 readState: 
 readAnticallState 
 } = safeImport('./commands/anticall');
 
const {
 pmblockerCommand, 
 readState: readPmBlockerState 
 } = safeImport('./commands/pmblocker');
 
const {
 addCommandReaction,
 handleAutoReact,
 handleAreactCommand
 } = require('./lib/reactions');
 
const {
  autoStatusCommand, 
  handleStatusUpdate 
  } = safeImport('./commands/autostatus');
  
const {
 startHangman, 
 guessLetter 
 } = safeImport('./commands/hangman');
 
const {
 startTrivia, 
 answerTrivia 
 } = safeImport('./commands/trivia');

const {
 eplStandings,
 eplFixtures,
 eplResults,
 eplHelp
 } = safeImport('./commands/epl');

const {
 miscCommand, 
 handleHeart 
 } = safeImport('./commands/misc');
const { 
   setWatermarkCommand, 
   applyWatermark, 
   applyMediaWatermark 
} = safeImport('./commands/setwatermark');
const { 
   handleDevReact
} = safeImport('./commands/devreact');
const { 
   opentimeCommand, 
   closetimeCommand, 
   tagadminCommand 
} = safeImport('./commands/grouptime');
const { 
   blockCommand,
   unblockCommand,
   blocklistCommand, 
   unblockallCommand 
} = safeImport('./commands/block');
const { 
    pendingRequestsCommand, 
    approveAllCommand, 
    rejectAllCommand
} = safeImport('./commands/grouprequests');
const { 
    antidemoteCommand, 
    antipromoteCommand,
    handleGroupParticipantsUpdate: handleAntiPromoteDemote
} = safeImport('./commands/antipromote');
const { 
obfuscateCommand, 
obfuscateAdvancedCommand, 
quickObfuscateCommand 
} = safeImport('./commands/obfuscate');
const {
  getSetting,
  setSetting,
  storeUserMessage
} = require('./lib/chatbot.db');
const _chatbotMod = lazyCmdNamed('./commands/chatbot');
const handleChatbotCommand = (...a) => _chatbotMod.handleChatbotCommand(...a);
const handleChatbotResponse = (...a) => _chatbotMod.handleChatbotResponse(...a);
const handleLangCommand = (...a) => _chatbotMod.handleLangCommand(...a);

const { antibugCommand, isAntibugEnabled, handleAntibug } = safeImport('./commands/antibug');
const { autofontCommand, isFontStyleEnabled, applyFontStyle, getCurrentFont } = safeImport('./commands/autofont');
const { autoblockCommand, isAutoblockEnabled, handleAutoblock } = safeImport('./commands/autoblock');
const { statusAntideleteCommand, isStatusAntideleteEnabled, storeStatus, handleStatusRevocation } = safeImport('./commands/statusantidelete');
const { autoBioCommand, startAutoBio, stopAutoBio } = safeImport('./commands/autobio');
const { autolikeCommand } = safeImport('./commands/autolike');
const { autoviewCommand } = safeImport('./commands/autoview');

 
/*━━━━━━━━━━━━━━━━━━━━*/
//Command imorts ---
/*━━━━━━━━━━━━━━━━━━━━*/
const { paymentCommand, setPaymentCommand, delPaymentCommand } = safeImport('./commands/payment');
const { techCommand, setBankPaymentCommand, delBankPaymentCommand } = safeImport('./commands/bankpayment');
const { mpesaPayCommand, payStatusCommand } = safeImport('./commands/mpesa');
const gitcloneCommand = safeImport('./commands/gitclone');
const getpluginCommand = safeImport('./commands/getplugin');
const pairCommand = safeImport('./commands/pair');
const { chaneljidCommand } = safeImport('./commands/chaneljid');
const getppCommand =require('./commands/getpp');
const tagAllCommand = safeImport('./commands/tagall');
const helpCommand = safeImport('./commands/help');
const banCommand = safeImport('./commands/ban');
const { promoteCommand } = safeImport('./commands/promote');
const { demoteCommand } = safeImport('./commands/demote');
const muteCommand = safeImport('./commands/mute');
const unmuteCommand = safeImport('./commands/unmute');
const stickerCommand = lazyCmd('./commands/sticker');
const imgCommand = safeImport('./commands/img');
const shazamCommand = safeImport('./commands/shazam');
const reportBugCommand = safeImport('./commands/reportbug');
const saveStatusCommand = safeImport('./commands/save');
const fetchCommand = safeImport('./commands/fetch');
const vcfCommand = safeImport('./commands/vcf'); // Add this line
const addApiCommand = safeImport('./commands/addapi');
const listApisCommand = safeImport('./commands/listapis');
const setGroupStatusCommand = lazyCmd('./commands/togstatus');
const developerCommand = safeImport('./commands/developer');

/*━━━━━━━━━━━━━━━━━━━━*/
const warnCommand = safeImport('./commands/warn');
const warningsCommand = safeImport('./commands/warnings');
/*━━━━━━━━━━━━━━━━━━━━*/

const deleteCommand = safeImport('./commands/delete');
const closeGCCommand = safeImport('./commands/closegc');
const openGCCommand = safeImport('./commands/opengc');
const killAllCommand = safeImport('./commands/killall');
const linkCommand = safeImport('./commands/link');
const { 
    handleAntiGroupMentionCommand, 
    handleGroupMentionDetection 
} = safeImport('./commands/antigroupmention');
const { 
   handleAntiStickerCommand, 
   handleStickerDetection 
} = safeImport('./commands/antisticker');
const { handleAntiPhotoCommand, handlePhotoDetection } = safeImport('./commands/antiphoto');
const ttsCommand = safeImport('./commands/tts');
const ownerCommand = safeImport('./commands/owner');
const listonlineCommand = safeImport('./commands/listonline');
const leaveGroupCommand = safeImport('./commands/leavegroup');
const nglCommand = safeImport('./commands/ngl');

/*━━━━━━━━━━━━━━━━━━━━*/
const memeCommand = safeImport('./commands/meme');
const tagCommand = safeImport('./commands/tag');
const tagNotAdminCommand = safeImport('./commands/tagnotadmin');
const tagAdminCommand = safeImport('./commands/tagadmin');
const hideTagCommand = safeImport('./commands/hidetag');
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
const jokeCommand = safeImport('./commands/joke');
const quoteCommand = safeImport('./commands/quote');
const factCommand = safeImport('./commands/fact');
const weatherCommand = safeImport('./commands/weather');
const newsCommand = safeImport('./commands/news');
const kickCommand = safeImport('./commands/kick');
const kickRevertCommand = safeImport('./commands/kickrevert');
const { autojoinCommand } = safeImport('./commands/autojoin');
const addCommand = safeImport('./commands/add');
const simageCommand = lazyCmd('./commands/simage');
const attpCommand = lazyCmd('./commands/attp');
const { complimentCommand } = safeImport('./commands/compliment');
const onlineCommand = safeImport('./commands/online');
const kickAllCommand = safeImport('./commands/kickall');

/*━━━━━━━━━━━━━━━━━━━━*/
const { insultCommand } = safeImport('./commands/insult');
const { eightBallCommand } = safeImport('./commands/eightball');
const { lyricsCommand } = safeImport('./commands/lyrics');
const { dareCommand } = safeImport('./commands/dare');
const { truthCommand } = safeImport('./commands/truth');
const { clearCommand } = safeImport('./commands/clear');
const pingCommand = safeImport('./commands/ping');
const sudoCommand = safeImport('./commands/sudo');
const aliveCommand = safeImport('./commands/alive');
const blurCommand = lazyCmd('./commands/img-blur');
const githubCommand = safeImport('./commands/github');
const forkCommand = safeImport('./commands/fork');
const pushPublicCommand = safeImport('./commands/pushpublic');
const uptimeCommand = safeImport('./commands/uptime');
const tutorialCommand = safeImport('./commands/tutorial');
const setMenuImageCommand = safeImport('./commands/setmenuimage');
const connectCommand = safeImport('./commands/connect');
const listConnectedCommand = safeImport('./commands/listconnected');
const deployManager = require('./deployManager');
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
const antibadwordCommand = safeImport('./commands/antibadword');
const takeCommand = safeImport('./commands/take');
const { flirtCommand } = safeImport('./commands/flirt');
const characterCommand = safeImport('./commands/character');
const wastedCommand = safeImport('./commands/wasted');
const shipCommand = safeImport('./commands/ship');
const groupInfoCommand = safeImport('./commands/groupinfo');
const resetlinkCommand = safeImport('./commands/resetlink');
const staffCommand = safeImport('./commands/staff');
const unbanCommand = safeImport('./commands/unban');
const emojimixCommand = safeImport('./commands/emojimix');
const { handlePromotionEvent } = safeImport('./commands/promote');
const { handleDemotionEvent } = safeImport('./commands/demote');
const viewOnceCommand = safeImport('./commands/viewonce');
const { vvReplyCommand, vvDmCommand } = safeImport('./commands/vvreply');
const forceSendCommand = safeImport('./commands/forcesend');
const clearSessionCommand = safeImport('./commands/clearsession');
const { simpCommand } = safeImport('./commands/simp');
const { stupidCommand } = safeImport('./commands/stupid');
const stickerTelegramCommand = lazyCmd('./commands/stickertelegram');
const textmakerCommand = lazyCmd('./commands/textmaker');
const clearTmpCommand = safeImport('./commands/cleartmp');
const setProfilePicture = safeImport('./commands/setpp');
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
const instagramCommand = lazyCmd('./commands/instagram');
const facebookCommand = safeImport('./commands/facebook');
const { movieCommand, movieSearchCommand } = safeImport('./commands/movie');
const { urlShortenerCommand } = safeImport('./commands/urlshortener');
const { animagineCommand } = safeImport('./commands/imagine');
const spotifyCommand = safeImport('./commands/spotify');
const playCommand = lazyCmd('./commands/play');
const tiktokCommand = safeImport('./commands/tiktok');
const songCommand = lazyCmd('./commands/song');
const aiCommand = safeImport('./commands/ai');
const urlCommand = safeImport('./commands/url');
const { handleTranslateCommand } = safeImport('./commands/translate');
const { handleSsCommand } = safeImport('./commands/ss');
const musicCommand = lazyCmd('./commands/music');
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
const { goodnightCommand } = safeImport('./commands/goodnight');
const { shayariCommand } = safeImport('./commands/shayari');
const { rosedayCommand } = safeImport('./commands/roseday');
const imagineCommand = safeImport('./commands/imagine');
const videoCommand = lazyCmd('./commands/video');
const { animeCommand } = safeImport('./commands/anime');
const { piesCommand, piesAlias } = safeImport('./commands/pies');
const stickercropCommand = lazyCmd('./commands/stickercrop');
const updateCommand = safeImport('./commands/update');
const removebgCommand = lazyCmd('./commands/removebg');
const _reminiMod = lazyCmdNamed('./commands/remini');
const reminiCommand = (...a) => _reminiMod.reminiCommand(...a);
const _igsMod = lazyCmdNamed('./commands/igs');
const igsCommand = (...a) => _igsMod.igsCommand(...a);
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
const settingsCommand = safeImport('./commands/settings');
const soraCommand = safeImport('./commands/sora');
const apkCommand = safeImport('./commands/apk');
const bibleCommand = safeImport('./commands/bible');
const quranCommand = safeImport('./commands/quran');
const menuConfigCommand = safeImport('./commands/menuConfig');
const ytsCommand = safeImport('./commands/yts');
const joinCommand = safeImport('./commands/join');
const { mysettingsCommand } = safeImport('./commands/mysettings');

/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
// Advanced settings commands
/*━━━━━━━━━━━━━━━━━━━━*/
const {
  setbotimageCommand,
  setvarCommand,
  modeCommand,
  toggleSettingCommand,
  setauthorCommand,
  setpacknameCommand
} = safeImport('./commands/advancedsettings');
/*━━━━━━━━━━━━━━━━━━━━*/

/*━━━━━━━━━━━━━━━━━━━━*/
// Global settings
/*━━━━━━━━━━━━━━━━━━━━*/
global.packname = getConfig('STICKER_PACK') || settings.packname;
global.author = getConfig('STICKER_AUTHOR') || settings.author;
global.channelLink = "https://whatsapp.com/channel/0029VbCafMZBA1f42UxcYW0D";
global.ytch = "Truth md";

// Add this near the top of main.js with other global configurations
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363409714698622@newsletter',
            newsletterName: 'TRUTH MD',
            serverMessageId: -1
        }
    }
};

const _processedMsgIds = new Set();
const _MAX_DEDUP_SIZE = 500;

// ── Hot-path micro-caches — eliminates SQLite/file I/O on every message ──────
// Values are refreshed from source once the TTL expires so config changes
// (.setprefix, .mode, .sudo) propagate within a few seconds without restart.
const _hotCache = {
    prefix:  { v: null, t: 0, ttl: 10000 },
    mode:    { v: null, t: 0, ttl: 8000  },
    pmState: { v: null, t: 0, ttl: 15000 },
};
const _sudoCache = new Map(); // resolvedJid → { v: bool, t: timestamp }
const _SUDO_TTL  = 20000;    // 20 s — sudo changes are rare

// Pre-built Sets for O(1) admin/owner command lookup — no per-message array allocation
const _ADMIN_CMD_SET = new Set([
    'mute','unmute','promote','demote','kick','tagall','tagnotadmin',
    'tagadmin','hidetag','antilink','antitag','setgdesc','setgname','setgpp'
]);
const _OWNER_CMD_SET = new Set([
    'mode','autostatus','autoviewstatus','autovewstatus','antidelete','cleartmp',
    'setpp','getpp','clearsession','areact','autoreact','autotyping','autoread','autojoin',
    'pmblocker','pmblock','antibug','autofont','autoblock','statusantidelete',
    'autobio','antiviewonce','autosavestatus','autorecordtype','setmention','sudo',
    'alwaysonline','autorecording','autolike','autoview','autovew','anticall',
    'antiedit','autostatusreact','setmenuimage','changemenu','setprefix',
    'setownername','setbotname','setvar','setwatermark','setownernumber',
    'ban','unban','gitclone','update','restart','shutdown',
    'fetchgroups','getgroups','grouplist',
    'leave','leavegroup','exitgroup',
    'addapi','deleteapi','removeapi',
    'setpayment','delpayment','setbankpayment','delbankpayment'
]);

async function handleMessages(sock, messageUpdate, printLog ) {
    const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    try {
        const { messages, type } = messageUpdate;
        // 'notify' = inbound from others. 'append' = own messages synced from other devices.
        // Allow both — append covers self-chat commands from the owner's phone.
        if (type !== 'notify' && type !== 'append') {
            return;
        }

        const message = messages[0];

        const isGroup = message.key.remoteJid.endsWith('@g.us');
        const isChannel = message.key.remoteJid.endsWith('@newsletter');
        if (!message?.message) {
            return;
        }

        const _msgId = message.key?.id;
        if (_msgId) {
            if (_processedMsgIds.has(_msgId)) return;
            _processedMsgIds.add(_msgId);
            if (_processedMsgIds.size > _MAX_DEDUP_SIZE) {
                const first = _processedMsgIds.values().next().value;
                _processedMsgIds.delete(first);
            }
        }

        // Drop sender-key-exchange messages — purely a Signal Protocol handshake with no handler.
        // protocolMessage is intentionally NOT filtered here — the revocation handler below needs it.
        const _mainMsgType = message.message ? Object.keys(message.message).find(k => k !== 'messageContextInfo') : null;
        if (_mainMsgType === 'senderKeyDistributionMessage') return;

        handleAutoReact(sock, message).catch(() => {});

        if (isAntibugEnabled() || isAutoblockEnabled()) {
            const [_antibug, _autoblock] = await Promise.all([
                handleAntibug(sock, message),
                handleAutoblock(sock, message)
            ]);
            if (_antibug || _autoblock) return;
        }

        // Fire-and-forget — readMessages is a network call that doesn't gate anything
        handleAutoread(sock, message).catch(() => {});
        if (message.message) {
            storeMessage(sock, message);
            storeStatus(sock, message);
        }

        const protoType = message.message?.protocolMessage?.type;
        if (message.message?.protocolMessage?.key && (protoType === 0 || protoType === undefined || protoType === null)) {
            await Promise.all([
                handleMessageRevocation(sock, message),
                handleStatusRevocation(sock, message)
            ]);
            return;
        }

        const rawChatId = message.key.remoteJid;
        const rawSenderId = message.key.participant || message.key.remoteJid;
        const senderAlt = message.key.participantAlt || message.key.remoteJidAlt || '';
        const senderId = (senderAlt && senderAlt.includes('@s.whatsapp.net')) ? senderAlt : rawSenderId;

        if (rawSenderId.includes('@lid') && senderAlt.includes('@s.whatsapp.net')) {
            updateLidMap([{ id: senderAlt, lid: rawSenderId }]);
        }

        // If sender is still an unresolved @lid (no senderAlt), fetch group metadata in the
        // background to build the LID→phone map so future messages from this sender resolve correctly.
        if (rawSenderId.includes('@lid') && !senderAlt.includes('@s.whatsapp.net') && rawChatId.endsWith('@g.us')) {
            try {
                sock.groupMetadata(rawChatId).then(meta => {
                    if (meta?.participants) {
                        const pairs = meta.participants
                            .filter(p => p.id && p.lid)
                            .map(p => ({ id: p.id, lid: p.lid }));
                        if (pairs.length) updateLidMap(pairs);
                    }
                }).catch(() => {});
            } catch (_e) {}
        }

        // Warm group metadata early so command replies do not pay the first-hit
        // cost during sendMessage() or isAdmin() checks.
        if (isGroup) {
            try {
                if (typeof sock.groupMetadataCached === 'function') {
                    sock.groupMetadataCached(chatId).catch(() => {});
                } else if (typeof sock.groupMetadata === 'function') {
                    sock.groupMetadata(chatId).catch(() => {});
                }
            } catch (_e) {}
        }

        // Devreact — called here so LID map is already updated from participantAlt above
        handleDevReact(sock, message, senderId).catch(e => console.error('[devReact] uncaught:', e?.message || e));

        // Resolve LID JIDs for DM chats.
        const _botPhoneJidGlobal = (sock?.user?.id || '').replace(/:\d+@/, '@');
        const _botNumGlobal = _botPhoneJidGlobal.split('@')[0];

        let chatId = rawChatId;
        if (!rawChatId.endsWith('@g.us') && rawChatId.includes('@lid')) {
            // Use sock.user.lid (the bot's own @lid JID) to detect self-chat definitively.
            // If rawChatId === bot's own @lid → saved-messages/self-chat → use phone JID.
            // If rawChatId is any other @lid → DM to a LID contact → leave as @lid
            // (Baileys routes @lid DMs natively; no need to resolve to phone JID).
            const botLidRaw = sock?.user?.lid || '';
            const botLid = botLidRaw.replace(/:.*@/, '@');
            const rawNorm = rawChatId.replace(/:.*@/, '@');

            if (botLid && rawNorm === botLid) {
                // Confirmed self-chat
                if (_botPhoneJidGlobal && !_botPhoneJidGlobal.includes('@lid')) {
                    chatId = _botPhoneJidGlobal;
                }
            } else {
                // DM to another LID contact.
                // Prefer LID map resolution if available; otherwise Baileys routes @lid natively.
                const resolved = resolveToPhoneJid(rawChatId);
                if (resolved && !resolved.includes('@lid') &&
                    (_botNumGlobal === '' || resolved.split('@')[0] !== _botNumGlobal)) {
                    chatId = resolved;
                } else if (senderAlt && senderAlt.includes('@s.whatsapp.net') &&
                    (_botNumGlobal === '' || senderAlt.split('@')[0] !== _botNumGlobal)) {
                    chatId = senderAlt;
                }
                // else: chatId stays as rawChatId (@lid) — Baileys routes it
            }
        }

 /*━━━━━━━━━━━━━━━━━━━━*/
       // Dynamic prefix      
        // Per-session prefix read
        const prefix = getPrefix(botJid);

        
        
        const resolvedSenderId = resolveToPhoneJid(senderId);
        // [FIXED] owner always access
        // Cached isSudo — avoids file/DB hit on every message (20s TTL)
        let senderIsSudo;
        {
            const _cached = _sudoCache.get(resolvedSenderId);
            const _t = Date.now();
            if (_cached && _t - _cached.t < _SUDO_TTL) {
                senderIsSudo = _cached.v;
            } else {
                senderIsSudo = await isSudo(resolvedSenderId);
                _sudoCache.set(resolvedSenderId, { v: senderIsSudo, t: _t });
                if (_sudoCache.size > 500) _sudoCache.delete(_sudoCache.keys().next().value);
            }
        }
        if (!senderIsSudo) {
            try {
                // session-detected owner (per-bot OWNER_NUMBER) always wins; global/env is fallback
                const _botOwner = getSessionSetting(botJid, 'OWNER_NUMBER');
                const _ownerNum = (_botOwner || global.OWNER_NUMBER || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g,'');
                const _connNum = (sock && sock.user && sock.user.id ? sock.user.id.split(':')[0].split('@')[0] : '');
                const _senderNum = resolvedSenderId.split('@')[0];
                if (message.key.fromMe === true) senderIsSudo = true;
                else if (_ownerNum && _senderNum === _ownerNum) senderIsSudo = true;
                else if (_connNum && _senderNum === _connNum) senderIsSudo = true;
            } catch (_) {}
        }

        // Channel (newsletter) messages: only channel admins can post in WhatsApp channels,
        // so trust the sender as a privileged user. Also wrap sock.sendMessage so that
        // quoted-reply options are stripped for newsletter JIDs — WhatsApp channels do not
        // support quoted replies and silently drop them, making every command response invisible.
        if (isChannel) {
            senderIsSudo = true;
            const _origSockForCh = sock;
            sock = new Proxy(_origSockForCh, {
                get(target, prop, receiver) {
                    if (prop === 'sendMessage') {
                        return async (jid, content, options = {}) => {
                            if (typeof jid === 'string' && jid.endsWith('@newsletter')) {
                                const { quoted: _q, ...safeOpts } = options || {};
                                return target.sendMessage(jid, content, safeOpts);
                            }
                            return target.sendMessage(jid, content, options);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                }
            });
        }

        // Preserve original message for commands that need it (like connect)
const rawMessage = (
    message.message?.conversation?.trim() ||
    message.message?.extendedTextMessage?.text?.trim() ||
    message.message?.imageMessage?.caption?.trim() ||
    message.message?.videoMessage?.caption?.trim() ||
    message.message?.documentMessage?.caption?.trim() ||
    message.message?.documentWithCaptionMessage?.message?.documentMessage?.caption?.trim() ||
    ''
).replace(/\.\s+/g, '.').trim();

        // For command detection, use lowercase
        const userMessage = rawMessage.toLowerCase();

        // Keep rawText for other commands that need original casing
        const rawText = rawMessage;

        // [FIXED] Early exit for bot's own non-command group echoes.
        // When type==='append' + fromMe===true in a group, this is the bot's own
        // outgoing message echoed back by WhatsApp. If it doesn't start with the
        // command prefix it's a bot response — skip the entire pipeline to prevent
        // Antilink/badword/chatbot from firing on the bot's own messages and
        // corrupting the group session (which causes the bot to go silent).
        if (type === 'append' && message.key.fromMe && isGroup && !userMessage.startsWith(prefix)) {
            return;
        }

        // [DEBUG] Group message entry log — visible in PM2 logs (`pm2 logs TRUTH-MD`)
        // Logs every group message that reaches processing so you can trace silence.
        if (isGroup) {
            const _grpShort = chatId.split('@')[0].slice(-6);
            const _sndrShort = (resolveToPhoneJid(senderId) || senderId).split('@')[0];
            const _preview = userMessage ? userMessage.slice(0, 60) : '[media/empty]';
            const _isCmd = userMessage.startsWith(prefix);
            console.log(`[GRP] ${_sndrShort}→${_grpShort} | ${type} | fromMe=${message.key.fromMe} | cmd=${_isCmd} | "${_preview}"`);
        }

        const time = new Date().toLocaleTimeString();
        const pushname = message.pushName || "Unknown User";
        const isSelfChat = message.key.fromMe && !chatId.endsWith('@g.us') && !isChannel;
        const chatType = isGroup ? 'Group' : (isChannel ? 'Channel' : (isSelfChat ? 'Self' : 'Private'));
        const body = message.message.conversation || message.message.extendedTextMessage?.text || '';

        // ── Compact message trace (deferred — never blocks command handling) ─────
        setImmediate(() => {
            try {
                if (type === 'append' && message.key.fromMe) return;
                const _msgTs  = Number(message.messageTimestamp || 0) * 1000;
                const _delay  = _msgTs > 0 ? ((Date.now() - _msgTs) / 1000).toFixed(2) : '?';
                const _speed  = parseFloat(_delay) < 0.5 ? 'FAST' : parseFloat(_delay) < 2 ? 'OK' : 'SLOW';
                const _from   = resolvedSenderId.split('@')[0];
                const _chat   = chatId.split('@')[0];
                const _text   = body ? body.slice(0, 80) : `[${Object.keys(message.message || {}).find(k => k !== 'messageContextInfo') || 'media'}]`;
                console.log(chalk.cyan(`[MSG] ${_from} → ${_chat} | ${_delay}s [${_speed}] | ${_text}`));
            } catch (_) {}
        });


        // Pair command bypasses ALL mode / access / chatbot restrictions.
        // It must be reachable in any mode, any chat type, by any user —
        // including when the bot is in private/groups mode or has PM-blocker on.
        if (userMessage.startsWith(`${prefix}pair`)) {
            const pairArgs = rawText.slice(`${prefix}pair`.length).trim();
            await pairCommand(sock, chatId, message, pairArgs);
            return;
        }

        // Read chatbot settings once — reused below for PM blocker check too.
        let _chatbotEnabled = 'false', _chatbotMode = 'all';
        try { _chatbotEnabled = getSetting('chatbot_enabled') || 'false'; } catch (_) {}
        try { _chatbotMode    = getSetting('chatbot_mode')    || 'all';   } catch (_) {}

        try {

            // Cached mode read — avoids SQLite hit on every message (8s TTL)
            const _now_m = Date.now();
            if (!_hotCache.mode.v || _now_m - _hotCache.mode.t > _hotCache.mode.ttl) {
                _hotCache.mode.v = getConfig('MODE', settings.commandMode || 'public');
                _hotCache.mode.t = _now_m;
            }
            const mode = _hotCache.mode.v;
            if (!message.key.fromMe && !senderIsSudo) {
                const chatbotCovers =
                    _chatbotEnabled === 'true' && (
                        _chatbotMode === 'all' ||
                        (_chatbotMode === 'group' && isGroup) ||
                        (_chatbotMode === 'dm' && !isGroup)
                    );
                if (!chatbotCovers) {
                    if (mode === 'private') {
                        return; // Silent — non-owners get no reply in private mode
                    }
                    if (mode === 'groups' && !isGroup && !isChannel) {
                        if (userMessage.startsWith(prefix)) {
                            await sock.sendMessage(chatId, { text: '🔒 Bot only responds to commands *in groups* right now.' }, { quoted: message }).catch(() => {});
                        }
                        return;
                    }
                    if (mode === 'dms' && isGroup) {
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Error checking access mode:', error);
        }
        // Check if user is banned (skip ban check for unban command)
        if (isBanned(senderId) && !userMessage.startsWith('.unban')) {
            // Only respond occasionally to avoid spam
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: '❌ You are banned from using the bot. Contact an admin to get unbanned.',
                    ...channelInfo
                });
            }
            return;
        }

        // Per-user command rate limiting — skip for sudo/owner and non-command messages
        if (!senderIsSudo && !message.key.fromMe && userMessage.startsWith(prefix)) {
            try {
                if (!checkRateLimit(senderId)) {
                    return;
                }
            } catch (_) {}
        }

        // First check if it's a game move
        if (/^[1-9]$/.test(userMessage) || userMessage.toLowerCase() === 'surrender') {
            await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            return;
        }



        if (!message.key.fromMe) incrementMessageCount(chatId, senderId);

        // [FIXED] group detection — run all in parallel for faster response
        // Skip detection on the bot's own echoed messages (type:append, fromMe:true) —
        // running Antilink/badword on the bot's own responses (e.g. YouTube links from
        // .play) corrupts group session state and causes the bot to go silent.
        if (isGroup && !message.key.fromMe) {
            const detectionTasks = [
                handleStickerDetection(sock, chatId, message, senderId).catch(() => {}),
                handlePhotoDetection(sock, chatId, message, senderId).catch(() => {}),
                handleGroupMentionDetection(sock, chatId, message, senderId).catch(() => {})
            ];
            if (userMessage) {
                detectionTasks.push(handleBadwordDetection(sock, chatId, message, userMessage, senderId).catch(() => {}));
                detectionTasks.push(Antilink(message, sock).catch(() => {}));
            }
            Promise.all(detectionTasks).catch(() => {});
        }

        // Channel antilink: run separately for @newsletter JIDs
        if (isChannel && userMessage) {
            Antilink(message, sock).catch(() => {});
        }

        // PM blocker: block non-owner DMs when enabled — skip for channels (newsletter JIDs are not real DMs)
        if (!isGroup && !isChannel && !message.key.fromMe && !senderIsSudo) {
            try {
                // Cached PM blocker state — avoids file read on every DM (15s TTL)
                const _now_pm = Date.now();
                if (!_hotCache.pmState.v || _now_pm - _hotCache.pmState.t > _hotCache.pmState.ttl) {
                    _hotCache.pmState.v = readPmBlockerState();
                    _hotCache.pmState.t = _now_pm;
                }
                const pmState = _hotCache.pmState.v;
                if (pmState.enabled) {
                    const chatbotHandlesDM = _chatbotEnabled === 'true' && (_chatbotMode === 'dm' || _chatbotMode === 'all');
                    if (!chatbotHandlesDM) {
                        await sock.sendMessage(chatId, { text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.' });
                        try { await sock.updateBlockStatus(chatId, 'block'); } catch (e) { }
                        return;
                    }
                }
            } catch (e) { }
        }

        /*━━━━━━━━━━━━━━━━━━━━*/
        // Auto-vvreply: sticker or emoji reply to any media → send to owner DM (owner only)
        /*━━━━━━━━━━━━━━━━━━━━*/
        if (message.key.fromMe) {
            const isStickerReply = !!message.message?.stickerMessage;
            const replyText = message.message?.extendedTextMessage?.text
                || message.message?.conversation || '';
            // Emoji = short text (≤8 chars) that starts with an emoji character
            const isEmojiReply = replyText.length > 0 && replyText.length <= 8
                && /^\p{Emoji}/u.test(replyText);

            if (isStickerReply || isEmojiReply) {
                // Get contextInfo from the correct location — stickers store it in
                // stickerMessage.contextInfo, NOT extendedTextMessage.contextInfo
                const contextInfo = message.message?.stickerMessage?.contextInfo
                    || message.message?.extendedTextMessage?.contextInfo;
                const quoted = contextInfo?.quotedMessage;

                if (quoted) {
                    const viewOnceMsg = quoted.viewOnceMessageV2?.message
                        || quoted.viewOnceMessage?.message
                        || quoted.viewOnceMessageV2Extension?.message;
                    const mediaMsg = viewOnceMsg?.imageMessage
                        ? { type: 'image', media: viewOnceMsg.imageMessage }
                        : viewOnceMsg?.videoMessage
                        ? { type: 'video', media: viewOnceMsg.videoMessage }
                        : quoted.imageMessage?.viewOnce
                        ? { type: 'image', media: quoted.imageMessage }
                        : quoted.videoMessage?.viewOnce
                        ? { type: 'video', media: quoted.videoMessage }
                        : null;

                    if (mediaMsg) {
                        try {

                            const { downloadContentFromMessage: dlContent } = require('@whiskeysockets/baileys');
                            const { appendWatermark: addWM } = require('./lib/watermark');

                            const stream = await dlContent(mediaMsg.media, mediaMsg.type);
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                            if (buffer.length < 1000) {
                                await sock.sendMessage(chatId, { text: '❌ View-once already opened or expired.' }, { quoted: message });
                                return;
                            }

                            // Owner DM: strip device suffix from bot's own JID
                            const ownerDmJid = (sock.user?.id || '').replace(/:\d+@/, '@');

                            if (mediaMsg.type === 'image') {
                                await sock.sendMessage(ownerDmJid, {
                                    image: buffer,
                                    caption: addWM(mediaMsg.media.caption || '')
                                });
                            } else {
                                const fPath = require('path').join(__dirname, 'tmp', `auto_vv_${Date.now()}.mp4`);
                                require('fs').writeFileSync(fPath, buffer);
                                await sock.sendMessage(ownerDmJid, {
                                    video: { url: fPath },
                                    caption: addWM(mediaMsg.media.caption || '')
                                });
                                try { require('fs').unlinkSync(fPath); } catch {}
                            }

                            await sock.sendMessage(chatId, { text: '✅' }, { quoted: message });
                            return;
                        } catch (err) {
                            console.error('[AUTO-VVREPLY] Error:', err.message);
                            await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
                            return;
                        }
                    }
                }
            }
        }

        /*━━━━━━━━━━━━━━━━━━━━*/
        // Then check for command prefix
        /*━━━━━━━━━━━━━━━━━━━━*/
        
        
        // Check for "prefix" word — restricted to owner and sudos only
        if (userMessage === 'prefix' || userMessage === 'getprefix' || userMessage === 'whatprefix') {
            if (!message.key.fromMe && !senderIsSudo) {
                await sock.sendMessage(chatId, { text: `❌ Only the bot owner or sudos can use this command.` }, { quoted: message });
                return;
            }
            await sock.sendMessage(chatId, { 
                text: `*Current Prefix is:*  [ ${prefix} ]\n\n_To use a command, type the prefix followed by the command name._\n_Example: ${prefix}help_`,
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        // Then check for command prefix
        if (!userMessage.startsWith(prefix)) {
            // fromMe=true echoes (bot's own sent messages) must NOT trigger the chatbot,
            // autotyping, autorecording, or any reaction handler.  Only prefixed commands
            // sent from the owner's own phone should be processed for fromMe messages.
            if (message.key.fromMe) return;

            handleAutotypingForMessage(sock, chatId, userMessage).catch(() => {});
            handleAutorecordingForMessage(sock, chatId, userMessage).catch(() => {});

            if (isGroup) {
                await Promise.all([
                    handleTagDetection(sock, chatId, message, senderId),
                    handleMentionDetection(sock, chatId, message)
                ]);
            }
            await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
            return;
        }

        // O(1) admin/owner command detection via pre-built module-scope Sets
        const _cmdName = userMessage.startsWith(prefix) ? userMessage.slice(prefix.length).split(' ')[0] : '';
        const isAdminCommand = _ADMIN_CMD_SET.has(_cmdName);
        const isOwnerCommand = _OWNER_CMD_SET.has(_cmdName);

        let isSenderAdmin = false;
        let isBotAdmin = false;

        // Check admin status only for admin commands in groups
        if (isGroup && isAdminCommand) {
            let adminStatus = { isSenderAdmin: false, isBotAdmin: false };
            try {
                adminStatus = await isAdmin(sock, chatId, senderId, message);
            } catch (_adminErr) {
                console.error(`[isAdmin] Failed for ${chatId}: ${_adminErr.message}`);
            }
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: 'Please make the bot an admin to use admin commands.', ...channelInfo }, { quoted: message });
                return;
            }

            if (
                userMessage.startsWith(`${prefix}mute`) ||
                userMessage === `${prefix}unmute` ||
                userMessage.startsWith(`${prefix}promote`) ||
                userMessage.startsWith(`${prefix}demote`)
            ) {
                if (!isSenderAdmin && !message.key.fromMe) {
                    await sock.sendMessage(chatId, {
                        text: 'Sorry, only group admins can use this command.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
            }
        }

        // Check owner status for owner commands
        if (isOwnerCommand) {
            if (!message.key.fromMe && !senderIsSudo) {
                await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner or sudo!' }, { quoted: message });
                return;
            }
        }

        // For DMs/channels: fire-and-forget typing indicator — no artificial delay before commands
        if (!isGroup && isAutotypingEnabled()) {
            sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        }

        // Command handlers - Execute commands immediately without waiting for typing indicator
        // We'll show typing indicator after command execution if needed
        let commandExecuted = false;

        // ── Debug: log every recognised command before execution ─────────────
        if (_cmdName) {
            const _dbgChat = (resolveToPhoneJid(chatId) || chatId).split('@')[0].slice(-8);
            const _dbgSender = senderId.split('@')[0];
            console.log(`[CMD] ▶ START | cmd="${_cmdName}" | chat=...${_dbgChat} | sender=${_dbgSender} | group=${isGroup}`);
        }

        switch (true) {
       //prefix case 
        case userMessage.startsWith(`${prefix}setprefix`):
         await handleSetPrefixCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;

            case userMessage.startsWith(`${prefix}addapi`):
                await addApiCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith(`${prefix}listapis`):
                await listApisCommand(sock, chatId, message);
                commandExecuted = true;
                break;

              case userMessage.startsWith(`${prefix}cid`):
    await chaneljidCommand(sock, chatId, message);
    commandExecuted = true;
    break;
              //watermark import

           case userMessage.startsWith(`${prefix}setwatermark`):
    await setWatermarkCommand(sock, chatId, senderId, message, userMessage);
    break;
    //_________________________________
   
     case userMessage.startsWith(`${prefix}chatbot`): {
    const match = userMessage.split(' ')[1]; // on | off | undefined
    await handleChatbotCommand(
        sock,
        chatId,
        message,
        match,
        message.key.fromMe || senderIsSudo
    );
    commandExecuted = true;
    break;
}

    case userMessage.startsWith(`${prefix}lang`): {
        await handleLangCommand(sock, chatId, message, senderId, rawText);
        commandExecuted = true;
        break;
    }
//_________________________________________
                        
                              //set owner  
              
            case userMessage.startsWith(`${prefix}payment`):
                await paymentCommand(sock, chatId, message, prefix);
                break;

            case userMessage.startsWith(`${prefix}setpayment`):
                await setPaymentCommand(sock, chatId, senderId, message, rawText.split(' ').slice(1).join(' '), prefix, senderIsSudo);
                break;

            case userMessage.startsWith(`${prefix}delpayment`):
                await delPaymentCommand(sock, chatId, message, rawText.split(' ').slice(1).join(' '), prefix, message.key.fromMe, senderIsSudo);
                break;

            case userMessage.startsWith(`${prefix}tech`):
            case userMessage.startsWith(`${prefix}bankpayment`):
                await techCommand(sock, chatId, message, prefix);
                break;

            case userMessage.startsWith(`${prefix}setbankpayment`):
                await setBankPaymentCommand(sock, chatId, senderId, message, rawText.split(' ').slice(1).join(' '), prefix, senderIsSudo);
                break;

            case userMessage.startsWith(`${prefix}delbankpayment`):
                await delBankPaymentCommand(sock, chatId, message, rawText.split(' ').slice(1).join(' '), prefix, message.key.fromMe, senderIsSudo);
                break;

            // ── M-Pesa STK Push ─────────────────────────────────────
            case userMessage.startsWith(`${prefix}paystatus`):
                await payStatusCommand(sock, chatId, message, rawText.split(' ').slice(1).join(' '), prefix);
                break;

            case userMessage.startsWith(`${prefix}pay`):
                await mpesaPayCommand(sock, chatId, message, rawText.split(' ').slice(1).join(' '), prefix);
                break;

            case userMessage.startsWith(`${prefix}setownername`):
                await handleSetOwnerCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;

                 //set bot  
              
            case userMessage.startsWith(`${prefix}setbot`):
                await handleSetBotCommand(sock, chatId, senderId, message, userMessage, prefix);
                break
                
            case userMessage === `${prefix}simage`:
            case userMessage === `${prefix}toimage`: {
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMessage?.stickerMessage) {
                    await simageCommand(sock, quotedMessage, chatId);
                } else {
                    await sock.sendMessage(chatId, { text: 'Please reply to a sticker with the toimage command to convert it.',...channelInfo }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case userMessage.startsWith(`${prefix}add`) && !userMessage.startsWith(`${prefix}addapi`):
                await addCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
                break;
            case userMessage.startsWith(`${prefix}kickrevert`):
                await kickRevertCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
                break;
            case userMessage.startsWith(`${prefix}kick`): {
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await kickCommand(sock, chatId, senderId, mentionedJidListKick, message, senderIsSudo);
                break;
            }
            case userMessage.startsWith(`${prefix}mute`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const muteArg = parts[1];
                    const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
                    if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                        await sock.sendMessage(chatId, { text: 'Please provide a valid number of minutes or use?.mute with no number to mute immediately.'}, { quoted: message });
                    } else {
                        await muteCommand(sock, chatId, senderId, message, muteDuration);
                    }
                }
                break;

                      // Add menu configuration command
            case userMessage.startsWith(`${prefix}menuconfig`) || 
                 userMessage.startsWith(`${prefix}menuset`) || 
                 userMessage.startsWith(`${prefix}changemenu`): {
                const menuArgs = userMessage.split(' ').slice(1);
                await menuConfigCommand(sock, chatId, message, menuArgs);
                commandExecuted = true;
                break;
            }
              // Add these cases in your command switch statement
case userMessage.startsWith(`${prefix}connect`):
    // Use rawMessage to preserve case for session strings
    await connectCommand(sock, chatId, senderId, message, rawMessage, prefix);
    commandExecuted = true;
    break;

case userMessage === `${prefix}listconnected`:
case userMessage === `${prefix}listconnections`:
    await listConnectedCommand(sock, chatId, senderId, message, prefix);
    commandExecuted = true;
    break;

              case userMessage.startsWith(`${prefix}togroupstatus`) ||
     userMessage.startsWith(`${prefix}tostatus`) || 
     userMessage.startsWith(`${prefix}groupstatus`) ||
     userMessage.startsWith(`${prefix}swgc`):
    
    if (isGroup) {
        // In a group: only admins and owner/sudo may use this
        const togAdminStatus = await isAdmin(sock, chatId, senderId);
        if (!togAdminStatus.isSenderAdmin && !message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only group admins can use this command!' 
            }, { quoted: message });
            commandExecuted = true;
            break;
        }
    } else {
        // In a DM: only the owner/sudo may use this
        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only the bot owner can use this command in DMs!' 
            }, { quoted: message });
            commandExecuted = true;
            break;
        }
    }
    
    await setGroupStatusCommand(sock, chatId, message);
    commandExecuted = true;
    break;
              case userMessage === `${prefix}leave` || 
     userMessage === `${prefix}leavegroup` ||
     userMessage === `${prefix}exitgroup`:
    await leaveGroupCommand(sock, chatId, message, senderIsSudo);
    commandExecuted = true;
    break;

        case userMessage === `${prefix}fetchgroups` ||
             userMessage === `${prefix}getgroups` ||
             userMessage === `${prefix}grouplist`: {
            try {
                // Always fetch live — we need participant JIDs/LIDs which aren't in the tracker
                await sock.sendMessage(chatId, { text: '⏳ Fetching group list from WhatsApp...' }, { quoted: message });

                const _allGroups = await Promise.race([
                    sock.groupFetchAllParticipating(),
                    new Promise((_, r) => setTimeout(() => r(null), 25000))
                ]).catch(() => null);

                let _groups = [];
                if (_allGroups && typeof _allGroups === 'object') {
                    _groups = Object.values(_allGroups);
                }

                // Fallback to tracker (no participant data)
                if (!_groups.length) {
                    const { getGroups } = require('./lib/groupTracker');
                    const _tracked = getGroups();
                    _groups = Object.entries(_tracked).map(([jid, info]) => ({
                        id: jid,
                        subject: info.name || jid.split('@')[0],
                        participants: []
                    }));
                }

                if (!_groups.length) {
                    await sock.sendMessage(chatId, { text: '📭 *No groups found.*\nThe bot is not in any groups yet.' }, { quoted: message });
                    commandExecuted = true;
                    break;
                }

                // Sort alphabetically
                _groups.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

                const _total = _groups.length;

                const _entries = _groups.map((g, i) => {
                    const _name = g.subject || 'Unnamed';
                    const _gjid = g.id || '';
                    return `${i + 1}. *${_name}*\n   ID ${_gjid}`;
                });

                const _hint = `\n💡 Copy the group ID and use:\n*.togroupstatus {group_id} your message*`;

                // 50 groups per page
                const _chunkSize = 50;
                const _pages = Math.ceil(_entries.length / _chunkSize);
                const _headerMsg = `╭─── 📋 *GROUP LIST* ───╮\n*Total:* ${_total} groups\n╰──────────────────────╯\n\n`;

                for (let i = 0; i < _entries.length; i += _chunkSize) {
                    const _chunk = _entries.slice(i, i + _chunkSize);
                    const _page  = Math.floor(i / _chunkSize) + 1;
                    const _pfx   = i === 0 ? _headerMsg : `📄 *Page ${_page}/${_pages}*\n\n`;
                    const _isLast = i + _chunkSize >= _entries.length;
                    await sock.sendMessage(chatId, {
                        text: _pfx + _chunk.join('\n\n') + (_isLast ? _hint : '')
                    }, { quoted: i === 0 ? message : undefined });
                    if (!_isLast) await new Promise(r => setTimeout(r, 500));
                }
            } catch (_err) {
                await sock.sendMessage(chatId, { text: `❌ Failed to fetch groups: ${_err.message}` }, { quoted: message });
            }
            commandExecuted = true;
            break;
        }

              case userMessage.startsWith(`${prefix}block`) && !userMessage.startsWith(`${prefix}blocklist`) && !userMessage.startsWith(`${prefix}blockall`):
    await blockCommand(sock, chatId, message, senderIsSudo, userMessage, prefix);
    commandExecuted = true;
    break;

case userMessage.startsWith(`${prefix}unblock`) && !userMessage.startsWith(`${prefix}unblockall`):
    await unblockCommand(sock, chatId, message, senderIsSudo, userMessage, prefix);
    commandExecuted = true;
    break;

case userMessage === `${prefix}blocklist` || userMessage === `${prefix}listblocked`:
    await blocklistCommand(sock, chatId, message, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage === `${prefix}unblockall`:
    await unblockallCommand(sock, chatId, message, senderIsSudo);
    commandExecuted = true;
    break;
              case userMessage.startsWith(`${prefix}ngl`):
    await nglCommand(sock, chatId, message, userMessage, settings);
    commandExecuted = true;
    break;
              case userMessage === `${prefix}pending` || 
     userMessage === `${prefix}pendingrequests` ||
     userMessage === `${prefix}joinrequests`:
    
    await pendingRequestsCommand(sock, chatId, message);
    commandExecuted = true;
    break;

case userMessage === `${prefix}approveall`:
    await approveAllCommand(sock, chatId, message);
    commandExecuted = true;
    break;

case userMessage === `${prefix}rejectall`:
    await rejectAllCommand(sock, chatId, message);
    commandExecuted = true;
    break;
                case userMessage === `${prefix}helpers`:
    await developerCommand(sock, chatId, message);
    commandExecuted = true;
    break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                //---some owner commands
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage === `${prefix}unmute`:
                await unmuteCommand(sock, chatId, senderId);
                break;
            case userMessage.startsWith(`${prefix}ban`):
                await banCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}unban`):
                await unbanCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}help` ||                            userMessage === `${prefix}menu` ||
                  userMessage === `${prefix}list`:
                await helpCommand(sock, chatId, message, global.channelLink);
                commandExecuted = true;
                break;
            case userMessage === `${prefix}sticker` || 
                 userMessage === `${prefix}s`:
                await stickerCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}warnings`): {
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warningsCommand(sock, chatId, mentionedJidListWarnings);
                break;
            }
            case userMessage.startsWith(`${prefix}warn`): {
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            }
            case userMessage.startsWith(`${prefix}delete`) || userMessage.startsWith(`${prefix}del`):
                await deleteCommand(sock, chatId, message, senderId);
                break;
            case userMessage === `${prefix}closegc`:
                await closeGCCommand(sock, chatId, message, senderId);
                break;
            case userMessage === `${prefix}opengc`:
                await openGCCommand(sock, chatId, message, senderId);
                break;
            case userMessage === `${prefix}killall`:
                await killAllCommand(sock, chatId, message, senderId);
                break;
            case userMessage === `${prefix}link`:
                await linkCommand(sock, chatId, message, senderId);
                break;
            case userMessage.startsWith(`${prefix}antisticker`):
                await handleAntiStickerCommand(sock, chatId, message, senderId);
                break;
            case userMessage.startsWith(`${prefix}antiphoto`):
                await handleAntiPhotoCommand(sock, chatId, message, senderId);
                break;

            case userMessage.startsWith(`${prefix}antigroupmention`):
                await handleAntiGroupMentionCommand(sock, chatId, message, senderId);
                break;

            case userMessage.startsWith(`${prefix}tts`): {
                const text = userMessage.slice(4).trim();
                await ttsCommand(sock, chatId, text, message);
                break;
            }
            case userMessage.startsWith(`${prefix}attp`):
                await attpCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}apk`):
                await apkCommand(sock, chatId, message);
                break;
              case userMessage.startsWith(`${prefix}img2link`) || 
     userMessage.startsWith(`${prefix}imagelink`) || 
     userMessage.startsWith(`${prefix}imgtourl`):
    await img2linkCommand(sock, chatId, senderId, message, userMessage);
    break;
              case userMessage.startsWith(`${prefix}yts`) || 
     userMessage.startsWith(`${prefix}ytsearch`):
    await ytsCommand(sock, chatId, senderId, message, userMessage);
    break;
              case userMessage.startsWith(`${prefix}autojoin`):
    await autojoinCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
    break;
              case userMessage.startsWith(`${prefix}join`):
    await joinCommand(sock, chatId, senderId, message, userMessage);
    break;
              case userMessage.startsWith(`${prefix}antiedit`): {
    const antieditMatch = userMessage.slice(9).trim();
    await handleAntieditCommand(sock, chatId, message, antieditMatch);
    break;
}
              case userMessage === `${prefix}removeall`:
    await kickAllCommand(sock, chatId, message, senderIsSudo);
    commandExecuted = true;
    break;

            case userMessage.startsWith(`${prefix}antidemote`):
                if (!isGroup) return;
                await antidemoteCommand(sock, chatId, message);
                commandExecuted = true;
                break;

            case userMessage.startsWith(`${prefix}antipromote`):
                if (!isGroup) return;
                await antipromoteCommand(sock, chatId, message);
                commandExecuted = true;
                break;
/*━━━━━━━━━━━━━━━━━━━━*/  
 //Obfuscation commands
/*━━━━━━━━━━━━━━━━━━━━*/
case userMessage.startsWith(`${prefix}obfuscate`):
case userMessage.startsWith(`${prefix}obfs`):
    await obfuscateCommand(sock, chatId, message, userMessage);
    commandExecuted = true;
    break;

case userMessage.startsWith(`${prefix}obfuscate2`):
case userMessage.startsWith(`${prefix}obfs2`):
case userMessage.startsWith(`${prefix}obfuscateadv`):
    await obfuscateAdvancedCommand(sock, chatId, message, userMessage);
    commandExecuted = true;
    break;

case userMessage.startsWith(`${prefix}quickobfs`):
case userMessage.startsWith(`${prefix}qobfs`):
    await quickObfuscateCommand(sock, chatId, message, userMessage);
    commandExecuted = true;
    break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // settings-------
                /*━━━━━━━━━━━━━━━━━━━━*/

            case userMessage === `${prefix}settings`:
            case userMessage === `${prefix}getsettings`:
                await settingsCommand(sock, chatId, message, senderIsSudo);
                break;
            case userMessage === `${prefix}mysettings`:
            case userMessage.startsWith(`${prefix}mysettings `):
                await mysettingsCommand(sock, chatId, message, userMessage.slice(`${prefix}mysettings`.length).trim().split(/\s+/), senderId);
                break;
            case userMessage.startsWith(`${prefix}setanticallmsg`):
                await setanticallmsgCommand(sock, chatId, message, userMessage, senderId);
                break;
            case userMessage.startsWith(`${prefix}anticall`):
                if (!message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, { text: 'Only owner/sudo can use anticall.' }, { quoted: message });
                    break;
                }
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    await anticallCommand(sock, chatId, message, args, senderId);
                }
                break;
            case userMessage.startsWith(`${prefix}pmblocker`):
                if (!message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, { text: 'Only owner/sudo can use pmblocker.' }, { quoted: message });
                    commandExecuted = true;
                    break;
                }
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    await pmblockerCommand(sock, chatId, message, args);
                }
                commandExecuted = true;
                break;
            case userMessage === `${prefix}owner`:
                await ownerCommand(sock, chatId);
                break;
                /*━━━━━━━━━━━━━━━━━━━━*/
                // Advanced settings commands
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}setbotimage`):
                await setbotimageCommand(sock, chatId, senderId, message, userMessage);
                break;
            case userMessage.startsWith(`${prefix}setbotname`):
                await setbotnameCommand(sock, chatId, senderId, message, userMessage);
                break;
            case userMessage.startsWith(`${prefix}setownername`):
                await setownernameCommand(sock, chatId, senderId, message, userMessage);
                break;
            case userMessage.startsWith(`${prefix}setauthor`):
                await setauthorCommand(sock, chatId, senderId, message, userMessage);
                break;
            case userMessage.startsWith(`${prefix}setpackname`):
                await setpacknameCommand(sock, chatId, senderId, message, userMessage);
                break;
            case userMessage === `${prefix}setvar`:
            case userMessage === `${prefix}cmdlist`:
                await setvarCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}mode`):
                await modeCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}autotyping`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOTYPING', 'Auto typing', prefix, 'autotyping');
                break;
            case userMessage.startsWith(`${prefix}alwaysonline`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'ALWAYSONLINE', 'Always online', prefix, 'alwaysonline');
                break;
            case userMessage.startsWith(`${prefix}autorecording`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTORECORDING', 'Auto recording', prefix, 'autorecording');
                break;
            case userMessage.startsWith(`${prefix}autostatusreact`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOSTATUSREACT', 'Auto status react', prefix, 'autostatusreact');
                break;
            case userMessage.startsWith(`${prefix}antibad`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'ANTIBADWORD', 'Anti bad word', prefix, 'antibad');
                break;
            case userMessage.startsWith(`${prefix}autosticker`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOSTICKER', 'Auto sticker', prefix, 'autosticker');
                break;
            case userMessage.startsWith(`${prefix}autoreply`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOREPLY', 'Auto reply', prefix, 'autoreply');
                break;
            case userMessage.startsWith(`${prefix}autoreact`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOREACT', 'Auto react', prefix, 'autoreact');
                break;
            case userMessage.startsWith(`${prefix}autostatusreply`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOSTATUSREPLY', 'Status reply', prefix, 'autostatusreply');
                break;
            case userMessage.startsWith(`${prefix}antibot`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'ANTIBOT', 'Anti bot', prefix, 'antibot');
                break;
            case userMessage.startsWith(`${prefix}heartreact`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'HEARTREACT', 'Heart react', prefix, 'heartreact');
                break;

            case userMessage.startsWith(`${prefix}antibug`):
                await antibugCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}autofont`):
                await autofontCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}autoblock`):
                await autoblockCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}statusantidelete`):
                await statusAntideleteCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}autobio`): {
                const bioArgs = userMessage.split(/\s+/).slice(1);
                const bioStatus = bioArgs[0]?.toLowerCase();
                if (!message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, { text: '*📛 Only the owner can use this command!*' }, { quoted: message });
                } else if (bioStatus === 'on') {
                    const { setConfig } = require('./lib/configdb');
                    setConfig('AUTOBIO', 'true');
                    await startAutoBio(sock);
                    await sock.sendMessage(chatId, { text: '✅ Auto bio has been turned on.' }, { quoted: message });
                } else if (bioStatus === 'off') {
                    const { setConfig } = require('./lib/configdb');
                    setConfig('AUTOBIO', 'false');
                    stopAutoBio();
                    await sock.sendMessage(chatId, { text: '✅ Auto bio has been turned off.' }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, { text: `*Example: ${prefix}autobio on/off*` }, { quoted: message });
                }
                break;
            }
            case userMessage.startsWith(`${prefix}autolike`):
                await autolikeCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage === `${prefix}autoview` || userMessage.startsWith(`${prefix}autoview `):
            case userMessage === `${prefix}autovew` || userMessage.startsWith(`${prefix}autovew `):
                await autoviewCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}antiviewonce`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'ANTIVIEWONCE', 'Anti view-once', prefix, 'antiviewonce');
                break;
            case userMessage.startsWith(`${prefix}autosavestatus`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTOSAVESTATUS', 'Auto save status', prefix, 'autosavestatus');
                break;
            case userMessage.startsWith(`${prefix}autorecordtype`):
                await toggleSettingCommand(sock, chatId, senderId, message, 'AUTORECORDTYPE', 'Auto record type', prefix, 'autorecordtype');
                break;

            case userMessage.startsWith(`${prefix}statuscapture`):
                await statusCaptureInfoCommand(sock, chatId, message);
                break;
              case userMessage.startsWith(`${prefix}img`) || 
     userMessage.startsWith(`${prefix}image`) || 
     userMessage.startsWith(`${prefix}googleimage`) ||
     userMessage.startsWith(`${prefix}searchimg`):
    await imgCommand(sock, chatId, senderId, message, userMessage);
    break;
                     
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // GroupCommands------
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage === `${prefix}tagall`:
                if (isSenderAdmin || message.key.fromMe) {
                    await tagAllCommand(sock, chatId, senderId, message);
                } else {
                    await sock.sendMessage(chatId, { text: 'Sorry, only group admins can use the .tagall command.', ...channelInfo }, { quoted: message });
                }
                break;
            case userMessage === `${prefix}tagnotadmin`:
                await tagNotAdminCommand(sock, chatId, senderId, message);
                break;
            case userMessage.startsWith(`${prefix}tagadmin`):
                {
                    const tagAdminText = rawText.slice(9).trim();
                    const tagAdminReply = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await tagAdminCommand(sock, chatId, senderId, tagAdminText, tagAdminReply, message);
                }
                break;
            case userMessage.startsWith(`${prefix}hidetag`):
                {
                    const messageText = rawText.slice(8).trim();
                    const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                }
                break;
            case userMessage.startsWith(`${prefix}tag`): {
                const messageText = rawText.slice(4).trim();  // use rawText here, not userMessage
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                break;
            }
            case userMessage.startsWith(`${prefix}antilink`):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Please make the bot an admin first.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;
            case userMessage.startsWith(`${prefix}antitag`):
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Please make the bot an admin first.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                await handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                break;
              case userMessage.startsWith(`${prefix}opentime`):
    await opentimeCommand(sock, chatId, senderId, message, userMessage);
    break;

case userMessage.startsWith(`${prefix}closetime`):
    await closetimeCommand(sock, chatId, senderId, message, userMessage);
    break;

case userMessage.startsWith(`${prefix}tagadmin`) || 
     userMessage.startsWith(`${prefix}tagadmins`):
    await tagadminCommand(sock, chatId, senderId, message, userMessage);
    break;
              case userMessage === `${prefix}online`:
    if (!isGroup) {
        await sock.sendMessage(chatId, { 
            text: 'This command can only be used in groups!', 
            ...channelInfo 
        }, { quoted: message });
        return;
    }
    await onlineCommand(sock, chatId, message);
    commandExecuted = true;
    break;
   case userMessage === `${prefix}vcf`:
    if (!isGroup) {
        await sock.sendMessage(chatId, { 
            text: '❌ This command can only be used in groups!' 
        }, { quoted: message });
        return;
    }
    
    // Use existing isSenderAdmin variable (no new adminStatus declaration)
    if (!isSenderAdmin && !message.key.fromMe && !senderIsSudo) {
        // But we need to check if isSenderAdmin was already set
        // If not, check admin status now
        const vcfAdminCheck = await isAdmin(sock, chatId, senderId);
        if (!vcfAdminCheck.isSenderAdmin && !message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { 
                text: '❌ Only group admins can export contacts!' 
            }, { quoted: message });
            return;
        }
    }
    
    await vcfCommand(sock, chatId, message);
    commandExecuted = true;
    break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // meme Commands and etc
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage === `${prefix}meme`:
                await memeCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}joke`:
                await jokeCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}quote`:
                await quoteCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}fact`:
                await factCommand(sock, chatId, message, message);
                break;
            case userMessage.startsWith(`${prefix}weather`): {
                const city = userMessage.slice(9).trim();
                if (city) {
                    await weatherCommand(sock, chatId, message, city);
                } else {
                    await sock.sendMessage(chatId, { text: `Please specify a city, e.g., ${prefix}weather London`, ...channelInfo }, { quoted: message });
                }
                break;
            }
            case userMessage === `${prefix}news`:
                await newsCommand(sock, chatId);
                break;
            case userMessage.startsWith(`${prefix}ttt`) || userMessage.startsWith(`${prefix}tictactoe`): {
                const tttText = userMessage.split(' ').slice(1).join(' ');
                await tictactoeCommand(sock, chatId, senderId, tttText);
                break;
            }
            case userMessage.startsWith(`${prefix}move`): {
                const position = parseInt(userMessage.split(' ')[1]);
                if (isNaN(position)) {
                    await sock.sendMessage(chatId, { text: 'Please provide a valid position number for Tic-Tac-Toe move.', ...channelInfo }, { quoted: message });
                } else {
                    tictactoeMove(sock, chatId, senderId, position);
                }
                break;
            }
/*━━━━━━━━━━━━━━━━━━━━*/
// Online tracking combined with topmembers
/*━━━━━━━━━━━━━━━━━━━━*/
case userMessage === `${prefix}online`:
case userMessage === `${prefix}listonline`:
case userMessage === `${prefix}offline`:
case userMessage === `${prefix}listoffline`:
case userMessage === `${prefix}topmembers`:
    if (!isGroup) {
        await sock.sendMessage(chatId, { 
            text: '❌ Group only command!' 
        }, { quoted: message });
        return;
    }
    
    if (userMessage === `${prefix}online` || userMessage === `${prefix}listonline`) {
        await listOnlineCommand(sock, chatId, isGroup);
    } else if (userMessage === `${prefix}offline` || userMessage === `${prefix}listoffline`) {
        await listOfflineCommand(sock, chatId, isGroup);
    } else {
        topMembers(sock, chatId, isGroup);
    }
    
    commandExecuted = true;
    break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // game commands
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}hangman`):
                startHangman(sock, chatId);
                break;
            case userMessage.startsWith(`${prefix}guess`): {
                const guessedLetter = userMessage.split(' ')[1];
                if (guessedLetter) {
                    guessLetter(sock, chatId, guessedLetter);
                } else {
                    sock.sendMessage(chatId, { text: `Please guess a letter using ${prefix}guess <letter>`, ...channelInfo }, { quoted: message });
                }
                break;
            }
            case userMessage.startsWith(`${prefix}trivia`):
                startTrivia(sock, chatId);
                break;
            case userMessage.startsWith(`${prefix}answer`): {
                const answer = userMessage.split(' ').slice(1).join(' ');
                if (answer) {
                    answerTrivia(sock, chatId, answer);
                } else {
                    sock.sendMessage(chatId, { text: `Please provide an answer using ${prefix}answer <answer>`, ...channelInfo }, { quoted: message });
                }
                break;
            }

            // ── EPL commands ────────────────────────────────────────
            case userMessage === `${prefix}epl` || userMessage.startsWith(`${prefix}epl `) || userMessage.startsWith(`${prefix}eplstandings`):
                await eplStandings(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}eplfix`) || userMessage.startsWith(`${prefix}eplfixtures`):
                await eplFixtures(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}eplresults`) || userMessage.startsWith(`${prefix}eplres`):
                await eplResults(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}eplhelp`):
                await eplHelp(sock, chatId, message, prefix);
                break;
            case userMessage.startsWith(`${prefix}compliment`):
                await complimentCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}insult`):
                await insultCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}8ball`): {
                const question = userMessage.split(' ').slice(1).join(' ');
                await eightBallCommand(sock, chatId, question);
                break;
            }
            case userMessage.startsWith(`${prefix}lyrics`): {
                const songTitle = userMessage.split(' ').slice(1).join(' ');
                await lyricsCommand(sock, chatId, songTitle, message);
                break;
            }
              // Add this case in your command switch statement
            case userMessage.startsWith(`${prefix}setownernumber`):
                await handleSetOwnerNumberCommand(sock, chatId, senderId, message, userMessage, prefix);
                break;
            case userMessage.startsWith(`${prefix}gitclone`):
                if (!message.key.fromMe && !senderIsSudo) {
                    await sock.sendMessage(chatId, { text: '❌ Only owner/sudo can use gitclone.' }, { quoted: message });
                    break;
                }
                await gitcloneCommand(sock, chatId, message);
                break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // Game commands
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}simp`): {
                const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await simpCommand(sock, chatId, quotedMsg, mentionedJid, senderId);
                break;
            }
            case userMessage.startsWith(`${prefix}stupid`) || userMessage.startsWith(`${prefix}itssostupid`) || userMessage.startsWith(`${prefix}iss`): {
                const stupidQuotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const stupidMentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const stupidArgs = userMessage.split(' ').slice(1);
                await stupidCommand(sock, chatId, stupidQuotedMsg, stupidMentionedJid, senderId, stupidArgs);
                break;
            }
            case userMessage === `${prefix}dare`:
                await dareCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}truth`:
                await truthCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}clear`:
                if (isGroup) await clearCommand(sock, chatId);
                break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // GroupCommand
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}promote`): {
                const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await promoteCommand(sock, chatId, mentionedJidListPromote, message);
                break;
            }
            case userMessage.startsWith(`${prefix}demote`): {
                const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await demoteCommand(sock, chatId, mentionedJidListDemote, message);
                break;
            }
            case userMessage === `${prefix}ping` ||
                  userMessage === `${prefix}p`:
                await pingCommand(sock, chatId, message);
                break;

            case userMessage.startsWith(`${prefix}sudo`):
            case userMessage.startsWith(`${prefix}addsudo`):
            case userMessage.startsWith(`${prefix}delsudo`):
            case userMessage.startsWith(`${prefix}removesudo`):
            case userMessage.startsWith(`${prefix}sudolist`):
            case userMessage.startsWith(`${prefix}getsudo`):
                await sudoCommand(sock, chatId, message);
                break;
           
           case userMessage.startsWith(`${prefix}bible`): {
    const query = rawText.slice(7).trim(); // Remove ".bible " from the message
    await bibleCommand(sock, chatId, message, query);
    break;
}
                
            case userMessage === `${prefix}quran`:
                await quranCommand(sock, chatId, message);
                break;
           
            case userMessage === `${prefix}getpp`:
               await getppCommand(sock, chatId, message, senderIsSudo);
              break;

            case userMessage.startsWith(`${prefix}setmenuimage`):
               await setMenuImageCommand(sock, chatId, senderId, message, userMessage);
              break;

            case userMessage === `${prefix}uptime`:
                await uptimeCommand(sock, chatId, message);
                break;
                
            case userMessage === `${prefix}tutorial`:
                await tutorialCommand(sock, chatId, message);
                break
                
            case userMessage === `${prefix}alive`:
                await aliveCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}mention`):
                {
                    const args = userMessage.split(' ').slice(1).join(' ');
                    const isOwner = message.key.fromMe || senderIsSudo;
                    await mentionToggleCommand(sock, chatId, message, args, isOwner);
                }
                break;
            case userMessage === `${prefix}setmention`:
                {
                    const isOwner = message.key.fromMe || senderIsSudo;
                    await setMentionCommand(sock, chatId, message, isOwner);
                }
                break;
            case userMessage.startsWith(`${prefix}blur`): {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                await blurCommand(sock, chatId, message, quotedMessage);
                break;
            }
            // Welcome commands
case userMessage.startsWith(`${prefix}welcome`):
    await welcomeCommand(sock, chatId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage.startsWith(`${prefix}setwelcome`):
    await setwelcomeCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage === `${prefix}showwelcome`:
    await showsettingsCommand(sock, chatId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage === `${prefix}resetwelcome`:
    await resetCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

// Goodbye commands
case userMessage.startsWith(`${prefix}goodbye`):
    await goodbyeCommand(sock, chatId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage.startsWith(`${prefix}setgoodbye`):
    await setgoodbyeCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage === `${prefix}showgoodbye`:
    await showsettingsCommand(sock, chatId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;

case userMessage === `${prefix}resetgoodbye`:
    await resetCommand(sock, chatId, senderId, message, userMessage, senderIsSudo);
    commandExecuted = true;
    break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // github
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage === `${prefix}git`:
            case userMessage === `${prefix}github`:
            case userMessage === `${prefix}sc`:
            case userMessage === `${prefix}script`:
            case userMessage === `${prefix}repo`:
                console.log(`[CMD] Executing repo command for ${chatId}`);
                await githubCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}fork`:
                await forkCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}pushpublic`:
                await pushPublicCommand(sock, chatId, message, args, isOwner);
                break;
            case userMessage.startsWith(`${prefix}antibadword`): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups.', ...channelInfo }, { quoted: message });
                    break;
                }
                const adminStatus = await isAdmin(sock, chatId, senderId);
                isSenderAdmin = adminStatus.isSenderAdmin;
                isBotAdmin = adminStatus.isBotAdmin;
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, { text: '*Bot must be admin to use this feature*', ...channelInfo }, { quoted: message });
                    break;
                }
                await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                break;
            }
;
            
           case userMessage.startsWith(`${prefix}take`): {
                const takeArgs = rawText.slice(5).trim().split(' ');
                await takeCommand(sock, chatId, message, takeArgs);
                break;
            }
            case userMessage === `${prefix}flirt`:
                await flirtCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}character`):
                await characterCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}waste`):
                await wastedCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}ship`:
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups!', ...channelInfo }, { quoted: message });
                    return;
                }
                await shipCommand(sock, chatId, message);
                break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                //Some groupCommands
                /*━━━━━━━━━━━━━━━━━━━━*/
                
                
            case userMessage === `${prefix}groupinfo` || 
                 userMessage === `${prefix}infogroup` || 
                 userMessage === '.infogrupo':
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups!', ...channelInfo }, { quoted: message });
                    return;
                }
                await groupInfoCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}reset` || userMessage === `${prefix}revoke`:
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups!', ...channelInfo }, { quoted: message });
                    return;
                }
                await resetlinkCommand(sock, chatId, senderId);
                break;
            case userMessage === `${prefix}admin` ||
                 userMessage === `${prefix}listadmin`:
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'This command can only be used in groups!', ...channelInfo }, { quoted: message });
                    return;
                }
                await staffCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}tourl`) || 
                 userMessage.startsWith(`${prefix}url`):
                await urlCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}emojimix`) ||
                 userMessage.startsWith(`${prefix}emix`):
                await emojimixCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}tg`) ||                                  userMessage.startsWith(`${prefix}tgsticker`):
                await stickerTelegramCommand(sock, chatId, message);
                break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // OtherCommands
                /*━━━━━━━━━━━━━━━━━━━━*/

            case userMessage === `${prefix}vv`:
                await viewOnceCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}vvreply`):
                await vvReplyCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}vvdm`):
                await vvDmCommand(sock, chatId, message, userMessage);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}forcesend`): {
                const fsArgs = userMessage.replace(/^.*?forcesend\s*/i, '').trim();
                await forceSendCommand(sock, chatId, message, fsArgs);
                commandExecuted = true;
                break;
            }
            case userMessage === `${prefix}clearsession` || userMessage === '.clearsesi':
                await clearSessionCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}autoviewstatus`):
            case userMessage.startsWith(`${prefix}autovewstatus`): {
                const rawArg = userMessage.split(' ').slice(1).join(' ').trim();
                const mappedArgs = rawArg ? [rawArg] : [];
                await autoStatusCommand(sock, chatId, message, mappedArgs);
                break;
            }
            case userMessage.startsWith(`${prefix}autostatus`): {
                const autoStatusArgs = userMessage.split(' ').slice(1);
                await autoStatusCommand(sock, chatId, message, autoStatusArgs);
                break;
            }
            case userMessage.startsWith(`${prefix}simp`):
                await simpCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}metallic`):
                await textmakerCommand(sock, chatId, message, userMessage, 'metallic');
                break;
            case userMessage.startsWith(`${prefix}ice`):
                await textmakerCommand(sock, chatId, message, userMessage, 'ice');
                break;
            case userMessage.startsWith(`${prefix}snow`):
                await textmakerCommand(sock, chatId, message, userMessage, 'snow');
                break;
            case userMessage.startsWith(`${prefix}impressive`):
                await textmakerCommand(sock, chatId, message, userMessage, 'impressive');
                break;
            case userMessage.startsWith(`${prefix}matrix`):
                await textmakerCommand(sock, chatId, message, userMessage, 'matrix');
                break;
            case userMessage.startsWith(`${prefix}light`):
                await textmakerCommand(sock, chatId, message, userMessage, 'light');
                break;
            case userMessage.startsWith(`${prefix}neon`):
                await textmakerCommand(sock, chatId, message, userMessage, 'neon');
                break;
            case userMessage.startsWith(`${prefix}devil`):
                await textmakerCommand(sock, chatId, message, userMessage, 'devil');
                break;
            case userMessage.startsWith(`${prefix}purple`):
                await textmakerCommand(sock, chatId, message, userMessage, 'purple');
                break;
            case userMessage.startsWith(`${prefix}thunder`):
                await textmakerCommand(sock, chatId, message, userMessage, 'thunder');
                break;
            case userMessage.startsWith(`${prefix}leaves`):
                await textmakerCommand(sock, chatId, message, userMessage, 'leaves');
                break;
            case userMessage.startsWith(`${prefix}1917`):
                await textmakerCommand(sock, chatId, message, userMessage, '1917');
                break;
            case userMessage.startsWith(`${prefix}arena`):
                await textmakerCommand(sock, chatId, message, userMessage, 'arena');
                break;
            case userMessage.startsWith(`${prefix}hacker`):
                await textmakerCommand(sock, chatId, message, userMessage, 'hacker');
                break;
            case userMessage.startsWith(`${prefix}sand`):
                await textmakerCommand(sock, chatId, message, userMessage, 'sand');
                break;
            case userMessage.startsWith(`${prefix}blakpink`):
                await textmakerCommand(sock, chatId, message, userMessage, 'blackpink');
                break;
            case userMessage.startsWith(`${prefix}glitch`):
                await textmakerCommand(sock, chatId, message, userMessage, 'glitch');
                break;
            case userMessage.startsWith(`${prefix}fire`):
                await textmakerCommand(sock, chatId, message, userMessage, 'fire');
                break;
            case userMessage.startsWith(`${prefix}antidelete`): {
                const antideleteMatch = userMessage.slice(11).trim();
                await handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                break;
            }
            case userMessage === `${prefix}surrender`:
                // Handle surrender command for tictactoe game
                await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
                break;
            case userMessage === `${prefix}cleartemp`:
                await clearTmpCommand(sock, chatId, message, senderIsSudo);
                break;
            case userMessage === `${prefix}setpp`:
                await setProfilePicture(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}setgdesc`):
                {
                    const text = rawText.slice(9).trim();
                    await setGroupDescription(sock, chatId, senderId, text, message);
                }
                break;
            case userMessage.startsWith(`${prefix}setgname`):
                {
                    const text = rawText.slice(9).trim();
                    await setGroupName(sock, chatId, senderId, text, message);
                }
                break;
            case userMessage.startsWith(`${prefix}setgpp`):
                await setGroupPhoto(sock, chatId, senderId, message);
                break;
            case userMessage.startsWith(`${prefix}creategroup`) || userMessage.startsWith(`${prefix}newgroup`):
                {
                    const cmdLen = userMessage.startsWith(`${prefix}creategroup`) ? `${prefix}creategroup`.length : `${prefix}newgroup`.length;
                    const text = rawText.slice(cmdLen).trim();
                    await createGroupCommand(sock, chatId, senderId, message, text);
                }
                break;
            case userMessage.startsWith(`${prefix}moviesearch`) || userMessage.startsWith(`${prefix}msearch`):
                await movieSearchCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}movie`):
                await movieCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}instagram`) ||                          userMessage.startsWith(`${prefix}insta`) ||  (userMessage === `${prefix}ig` || userMessage.startsWith('.ig ')):
                await instagramCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}igs`):
                await igsCommand(sock, chatId, message, true);
                break;
            case userMessage.startsWith(`${prefix}igs`):
                await igsCommand(sock, chatId, message, false);
                break;            
                case userMessage.startsWith(`${prefix}fb`) || userMessage.startsWith(`${prefix}facebook`):
                await facebookCommand(sock, chatId, message);
                break;
 /*━━━━━━━━━━━━━━━━━━━━*/
 /*******--song&play command cases--
 /*━━━━━━━━━━━━━━━━━━━━*/             
            case userMessage.startsWith(`${prefix}play`):
                await playCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}spotify`): 
                await spotifyCommand(sock, chatId, message);
                break;

           case userMessage.startsWith(`${prefix}img`):
             await imgCommand(sock, chatId, message);
              break;
                
            case userMessage.startsWith(`${prefix}song`) ||                                userMessage.startsWith(`${prefix}mp3`):
                await songCommand(sock, chatId, message);
                break;
           
            case userMessage.startsWith(`${prefix}music`) ||                                userMessage.startsWith(`${prefix}mp3`):
                await musicCommand(sock, chatId, message);
                break;
    
            case userMessage.startsWith(`${prefix}video`):
                await videoCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}tiktok`) ||
                 userMessage.startsWith(`${prefix}tt`):
                await tiktokCommand(sock, chatId, message);
                break;
           case userMessage === `${prefix}name`:
                await shazamCommand(sock, chatId, message);
                break;
              case userMessage === `${prefix}find`:
                await shazamCommand(sock, chatId, message);
                break;
           case userMessage === `${prefix}shazam`:
                await shazamCommand(sock, chatId, message);
                break;
              case userMessage === `${prefix}save`:
                await saveStatusCommand(sock, chatId, message, senderIsSudo);
                break;
              case userMessage === `${prefix}autoreadreciepts`:
                await autoreadReceiptsCommand(sock, chatId, message, senderIsSudo);
                break;
              case userMessage.startsWith(`${prefix}fetch`):
                await fetchCommand(sock, chatId, message);
                break;
              case userMessage === `${prefix}online` || 
     userMessage === `${prefix}listonline` || 
     userMessage === `${prefix}onlinelist`:
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: 'This command can only be used in groups!', ...channelInfo }, { quoted: message });
        return;
    }
    await listonlineCommand(sock, chatId, message);
    commandExecuted = true;
    break;

   /*━━━━━━━━━━━━━━━━━━━━*/
// Feedback & Report Commands
/*━━━━━━━━━━━━━━━━━━━━*/
case userMessage.startsWith(`${prefix}reportbug`):
case userMessage.startsWith(`${prefix}bugreport`):
case userMessage.startsWith(`${prefix}report`):
    await reportBugCommand(sock, chatId, message, userMessage, settings);
    commandExecuted = true;
    break;
 /*━━━━━━━━━━━━━━━━━━━━*/
 /*********--ai&gemini cmd cases--
 /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}aichat`):
                await aiCommand(sock, chatId, message, 'aichat');
                break;
            case userMessage.startsWith(`${prefix}gpt4omini`) || userMessage.startsWith(`${prefix}gpt4mini`):
                await aiCommand(sock, chatId, message, 'gpt4mini');
                break;
            case userMessage.startsWith(`${prefix}gpt4`):
                await aiCommand(sock, chatId, message, 'gpt4');
                break;
            case userMessage.startsWith(`${prefix}gpt3`):
                await aiCommand(sock, chatId, message, 'gpt3');
                break;
            case userMessage.startsWith(`${prefix}gpt`):
                await aiCommand(sock, chatId, message, 'gpt');
                break;
            case userMessage.startsWith(`${prefix}gemini`):
                await aiCommand(sock, chatId, message, 'gemini');
                break;
            case userMessage.startsWith(`${prefix}gemma`):
                await aiCommand(sock, chatId, message, 'gemma');
                break;
            case userMessage.startsWith(`${prefix}llama3`) || userMessage.startsWith(`${prefix}llama`):
                await aiCommand(sock, chatId, message, 'llama3');
                break;
            case userMessage.startsWith(`${prefix}deepseekr1`) || userMessage.startsWith(`${prefix}dsr1`):
                await aiCommand(sock, chatId, message, 'deepseekr1');
                break;
            case userMessage.startsWith(`${prefix}deepseek67b`) || userMessage.startsWith(`${prefix}ds67b`):
                await aiCommand(sock, chatId, message, 'deepseek67b');
                break;
            case userMessage.startsWith(`${prefix}deepseek`):
                await aiCommand(sock, chatId, message, 'deepseek');
                break;
            case userMessage.startsWith(`${prefix}metaai`) || userMessage.startsWith(`${prefix}meta`):
                await aiCommand(sock, chatId, message, 'metaai');
                break;
            case userMessage.startsWith(`${prefix}mixtral`):
                await aiCommand(sock, chatId, message, 'mixtral');
                break;
            case userMessage.startsWith(`${prefix}mistral`):
                await aiCommand(sock, chatId, message, 'mistral');
                break;
            case userMessage.startsWith(`${prefix}qvq`):
                await aiCommand(sock, chatId, message, 'qvq');
                break;
            case userMessage.startsWith(`${prefix}cohere`):
                await aiCommand(sock, chatId, message, 'cohere');
                break;
            case userMessage.startsWith(`${prefix}claude`):
                await aiCommand(sock, chatId, message, 'claude');
                break;
            case userMessage.startsWith(`${prefix}venice`):
                await aiCommand(sock, chatId, message, 'venice');
                break;
            case userMessage.startsWith(`${prefix}groq`):
                await aiCommand(sock, chatId, message, 'groq');
                break;
            case userMessage.startsWith(`${prefix}translate`) || 
                 userMessage.startsWith(`${prefix}trt`): {
                const commandLength = userMessage.startsWith(`${prefix}translate`) ? `${prefix}translate`.length : `${prefix}trt`.length;
                await handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                break;
            }
            case userMessage.startsWith(`${prefix}ss`) ||
                 userMessage.startsWith(`${prefix}ssweb`) || 
                 userMessage.startsWith(`${prefix}screenshot`): {
                const ssCommandLength = userMessage.startsWith(`${prefix}screenshot`) ? `${prefix}screenshot`.length : (userMessage.startsWith(`${prefix}ssweb`) ? `${prefix}ssweb`.length : `${prefix}ss`.length);
                await handleSsCommand(sock, chatId, message, userMessage.slice(ssCommandLength).trim());
                break;
            }
            case userMessage.startsWith(`${prefix}areact`) ||
                 userMessage.startsWith(`${prefix}autoreact`) ||
                 userMessage.startsWith(`${prefix}autoreaction`): {
                const isOwnerOrSudo = message.key.fromMe || senderIsSudo;
                await handleAreactCommand(sock, chatId, message, isOwnerOrSudo);
                break;
            }
            case userMessage === `${prefix}goodnight` || 
                 userMessage === '.lovenight' || 
                 userMessage === '.gn':
                await goodnightCommand(sock, chatId, message);
                break;
            case userMessage === '.shayari' || 
                 userMessage === '.shayri':
                await shayariCommand(sock, chatId, message);
                break;
            case userMessage === `${prefix}roseday`:
                await rosedayCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}animagine`):
                await animagineCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}imagine`) || 
                 userMessage.startsWith(`${prefix}flux`) || 
                 userMessage.startsWith(`${prefix}dalle`): 
                 await imagineCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}tinyurl`):
                await urlShortenerCommand(sock, chatId, message, 'tinyurl');
                break;
            case userMessage.startsWith(`${prefix}bitly`):
                await urlShortenerCommand(sock, chatId, message, 'bitly');
                break;
            case userMessage.startsWith(`${prefix}cuttly`):
                await urlShortenerCommand(sock, chatId, message, 'cuttly');
                break;
            case userMessage.startsWith(`${prefix}ssur`):
                await urlShortenerCommand(sock, chatId, message, 'ssur');
                break;
            case userMessage.startsWith(`${prefix}vgd`):
                await urlShortenerCommand(sock, chatId, message, 'vgd');
                break;
            case userMessage.startsWith(`${prefix}vurl`):
                await urlShortenerCommand(sock, chatId, message, 'vurl');
                break;
            case userMessage.startsWith(`${prefix}adfoc`):
                await urlShortenerCommand(sock, chatId, message, 'adfoc');
                break;
            case userMessage === `${prefix}jid`:
             await groupJidCommand(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}chjid`):
                await channelJidCommand(sock, chatId, message, rawText);
                break;
            case userMessage.startsWith(`${prefix}autoread`):
                await autoreadCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}heat`):
                await handleHeart(sock, chatId, message);
                break;
            case userMessage.startsWith(`${prefix}heart`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['horny', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}circle`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['circle', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix})gbtq`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lgbtq', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}lolice`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['lolice', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}simpcard`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['simpcard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}misc`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['misc', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith('.its-so-stupid'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['its-so-stupid', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}namecard`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['namecard', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;

            case userMessage.startsWith('.oogway2'):
            case userMessage.startsWith('.oogway'):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.startsWith('.oogway2') ? 'oogway2' : 'oogway';
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}tweet`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['tweet', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
            case userMessage.startsWith(`${prefix}ytcomment`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = ['youtube-comment', ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                
                break;
                // Add this case to your switch statement:
case userMessage.startsWith(`${prefix}getplugin`):
    await getpluginCommand(sock, chatId, message, prefix, senderIsSudo);
    commandExecuted = true;
    break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                //Photo EffectsCommand
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}comrade`):
            case userMessage.startsWith(`${prefix}gay`):
            case userMessage.startsWith(`${prefix}glass`):
            case userMessage.startsWith(`${prefix}jail`):
            case userMessage.startsWith(`${prefix}passed`):
            case userMessage.startsWith(`${prefix}triggered`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const sub = userMessage.slice(1).split(/\s+/)[0];
                    const args = [sub, ...parts.slice(1)];
                    await miscCommand(sock, chatId, message, args);
                }
                break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // Animu commands
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}animu`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    const args = parts.slice(1);
                    await animeCommand(sock, chatId, message, args);
                }
                break;
            // animu aliases
            case userMessage.startsWith(`${prefix}nom`):
            case userMessage.startsWith(`${prefix}poke`):
            case userMessage.startsWith(`${prefix}cry`):
            case userMessage.startsWith(`${prefix}hug`):
            case userMessage.startsWith(`${prefix}pat`):
            case userMessage.startsWith(`${prefix}kiss`):
            case userMessage.startsWith(`${prefix}wink`):
            case userMessage.startsWith(`${prefix}facepalm`):
            case userMessage.startsWith(`${prefix}face-palm`): 
            case userMessage.startsWith(`${prefix}quote`):
            case userMessage.startsWith(`${prefix}loli`):
                {
                    const parts = userMessage.trim().split(/\s+/);
                    let sub = parts[0].slice(1);
                    if (sub === 'facepalm') sub = 'face-palm';
                    if (sub === 'quote' || sub === 'animuquote') sub = 'quote';
                    await animeCommand(sock, chatId, message, [sub]);
                }
                break;
            case userMessage === `${prefix}crop`:
                await stickercropCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}pies`):
                {
                    const parts = rawText.trim().split(/\s+/);
                    const args = parts.slice(1);
                    await piesCommand(sock, chatId, message, args);
                    commandExecuted = true;
                }
                break;
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                //countries
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage === `${prefix}china`:
                await piesAlias(sock, chatId, message, 'china');
                commandExecuted = true;
                break;
            case userMessage === `${prefix}indonesia`:
                await piesAlias(sock, chatId, message, 'indonesia');
                commandExecuted = true;
                break;
            case userMessage === `${prefix}japan`:
                await piesAlias(sock, chatId, message, 'japan');
                commandExecuted = true;
                break;
            case userMessage === `${prefix}korea`:
                await piesAlias(sock, chatId, message, 'korea');
                commandExecuted = true;
                break;
            case userMessage === `${prefix}hijab`:
                await piesAlias(sock, chatId, message, 'hijab');
                commandExecuted = true;
                break;
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // RemoveBackgroundCommand
                /*━━━━━━━━━━━━━━━━━━━━*/
            case userMessage.startsWith(`${prefix}restart`):
            case userMessage.startsWith(`${prefix}update`):
            case userMessage.startsWith(`${prefix}reboot`):
                {
                    const parts = rawText.trim().split(/\s+/);
                    const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
                    await updateCommand(sock, chatId, message, senderIsSudo, zipArg);
                }
                commandExecuted = true;
                break;
            case userMessage.startsWith(`${prefix}removebg`) || 
                 userMessage.startsWith(`${prefix}rmbg`) || 
                 userMessage.startsWith(`${prefix}nobg`):
                await removebgCommand.exec(sock, message, userMessage.split(' ').slice(1));
                break;
            case userMessage.startsWith(`${prefix}remini`) ||
                 userMessage.startsWith(`${prefix}enhance`) || 
                 userMessage.startsWith(`${prefix}remin`):
                await reminiCommand(sock, chatId, message, userMessage.split(' ').slice(1));
                break;
            case userMessage.startsWith(`${prefix}sora`):
                await soraCommand(sock, chatId, message);
                break;
                
                
                
                /*━━━━━━━━━━━━━━━━━━━━*/
                // Group default Commands
                /*━━━━━━━━━━━━━━━━━━━━*/
                
                
            default:
                if (isGroup) {
                    await Promise.all([
                        handleTagDetection(sock, chatId, message, senderId),
                        handleMentionDetection(sock, chatId, message)
                    ]);
                }
                commandExecuted = false;
                break;
        }

        // ── Debug: log command completion ────────────────────────────────────
        if (_cmdName) {
            console.log(`[CMD] ✅ DONE  | cmd="${_cmdName}" | executed=${commandExecuted} | ack=⚡`);
        }
        // Notify the socket watchdog that a command was processed successfully
        if (commandExecuted !== false) {
            try { require('./lib/socketWatchdog').markCommandRan(); } catch (_) {}
        }

        // If a command was executed, show typing status after command execution
        if (commandExecuted !== false) {
            // Fire-and-forget — never block the message queue for typing animation delays
            showTypingAfterCommand(sock, chatId).catch(() => {});
            showRecordingAfterCommand(sock, chatId).catch(() => {});
        }

        async function channelJidCommand(sock, chatId, message, rawText) {
            const jid = message.key.remoteJid;
            const args = (rawText || '').replace(/^\.chjid\s*/i, '').trim();

            if (jid.endsWith('@newsletter')) {
                return await sock.sendMessage(chatId, {
                    text: `✅ *Channel JID:*\n\n${jid}`
                }, { quoted: message });
            }

            if (args) {
                const urlMatch = args.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/);
                if (urlMatch) {
                    try {
                        const inviteCode = urlMatch[1];
                        const metadata = await sock.newsletterMetadata('invite', inviteCode);
                        if (metadata && metadata.id) {
                            return await sock.sendMessage(chatId, {
                                text: `✅ *Channel JID:*\n\n${metadata.id}`
                            }, { quoted: message });
                        }
                    } catch (e) {
                        return await sock.sendMessage(chatId, {
                            text: `❌ Could not fetch channel info.\n\n*Error:* ${e.message || 'Unknown error'}`
                        }, { quoted: message });
                    }
                }
                return await sock.sendMessage(chatId, {
                    text: '❌ Invalid channel URL. Please provide a valid WhatsApp channel link.\n\n*Usage:* `.chjid https://whatsapp.com/channel/xxxxx`'
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, {
                text: '📝 *CHJID USAGE*\n\nUse this command inside a channel, or provide a channel URL:\n`.chjid https://whatsapp.com/channel/xxxxx`'
            }, { quoted: message });
        }

        // Function to handle .groupjid command
        async function groupJidCommand(sock, chatId, message) {
            const groupJid = message.key.remoteJid;

            if (!groupJid.endsWith('@g.us')) {
                return await sock.sendMessage(chatId, {
                    text: "❌ This command can only be used in a group."
                });
            }

            await sock.sendMessage(chatId, {
                text: `✅ Group JID: ${groupJid}`
            }, {
                quoted: message
            });
        }
    } catch (error) {
        try {
            // Use the already-resolved chatId from outer scope when available.
            // Fall back to raw remoteJid only for very-early failures (chatId not yet set).
            const _errChatId = (typeof chatId !== 'undefined' && chatId && !chatId.includes('@lid'))
                ? chatId
                : (typeof message !== 'undefined' ? message?.key?.remoteJid : undefined);
            console.error(`❌ Error in message handler [cmd="${typeof _cmdName !== 'undefined' ? _cmdName : '?'}"]:`, error.message || error);

            if (_errChatId && typeof sock !== 'undefined') {
                let errorMessage = error.message || 'Unknown error';
                const cmdText = typeof userMessage !== 'undefined' ? userMessage.split(' ')[0] : 'unknown';

                if (errorMessage === 'FEATURE_DISABLED' || error.code === 'MODULE_NOT_FOUND') {
                    await sock.sendMessage(_errChatId, {
                        text: `⚠️ *Feature Disabled*\n\nThis feature is not available in lite mode to save disk space.\n\n_Command:_ ${cmdText}`,
                        ...channelInfo
                    }, { quoted: message }).catch(() => {});
                    return;
                }

                if (errorMessage.includes('Cannot find module')) {
                    errorMessage = `Missing command file: ${errorMessage.split('\'')[1]}`;
                }

                const _errIsGroupFail = errorMessage.includes('group send') || errorMessage.includes('timed out');
                const _errIsGroup = typeof isGroup !== 'undefined' && isGroup;

                // Primary: try to send error to the chat where it happened
                const _sentToChat = await sock.sendMessage(_errChatId, {
                    text: `*❌ 𝙴𝚁𝚁𝙾𝚁 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳*\n\n*Command:* ${cmdText}\n*Error:* ${errorMessage}\n\n_Please report this to the developer._`,
                    ...channelInfo
                }, { quoted: message }).then(() => true).catch(() => false);

                // Fallback: if this is a group and the group send itself failed,
                // notify the sender via DM so they know the command ran but couldn't reply.
                if (!_sentToChat && _errIsGroup) {
                    try {
                        const _dmJid = (typeof senderId !== 'undefined' ? senderId : null);
                        if (_dmJid && !_dmJid.endsWith('@g.us')) {
                            await sock.sendMessage(_dmJid, {
                                text: `⚠️ *Group Reply Failed*\n\nYour command *${cmdText}* ran in the group but the reply could not be delivered (group may be throttling messages).\n\n*Error:* ${errorMessage}\n\n_Try again in a few seconds._`
                            });
                        }
                    } catch (_fb) {}
                }
            }
        } catch (innerErr) {
            // Error handler itself failed (usually the socket is disconnected).
            // Nothing more we can do — log both errors so they're visible in console.
            console.error('❌ Error in error handler (could not send error to user):', innerErr.message);
            console.error('   Original error was:', error?.message || error);
        }
    }
}


async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;

        // Check if it's a group
        if (!id.endsWith('@g.us')) return;

        let isPublic = true;
        try {
            const currentMode = getConfig('MODE', settings.commandMode || 'public');
            isPublic = currentMode === 'public' || currentMode === 'groups';
        } catch (e) {
            try {
                const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
            } catch (_) {}
        }

        // Handle promotion events
        if (action === 'promote') {
            await handleAntiPromoteDemote(sock, update);
            if (!isPublic) return;
            await handlePromotionEvent(sock, id, participants, author);
            return;
        }

        // Handle demotion events
        if (action === 'demote') {
            await handleAntiPromoteDemote(sock, update);
            if (!isPublic) return;
            await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        // Handle join events
        if (action === 'add') {
            // Track the group when the bot itself joins
            try {
                const botJid = sock.user?.id?.replace(/:[^@]+/, '') + '@s.whatsapp.net';
                if (participants.includes(botJid)) {
                    const { trackGroup } = require('./lib/groupTracker');
                    const meta = await sock.groupMetadata(id).catch(() => ({}));
                    trackGroup(id, meta.subject || '');
                }
            } catch (_) {}
            await handleJoinEvent(sock, id, participants);
        }

        // Handle leave events
        if (action === 'remove') {
            // Untrack the group when the bot itself leaves
            try {
                const botJid = sock.user?.id?.replace(/:[^@]+/, '') + '@s.whatsapp.net';
                if (participants.includes(botJid)) {
                    const { untrackGroup } = require('./lib/groupTracker');
                    untrackGroup(id);
                }
            } catch (_) {}
            await handleLeaveEvent(sock, id, participants);
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

// Instead, export the handlers along with handleMessages
module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        await handleStatusUpdate(sock, status);
    }
};
