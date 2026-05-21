const { containerRAM } = require('./lib/systemRAM');

const _totalRamMB = containerRAM;

function _scale(micro, tiny, low, mid, high, ultra) {
    if (_totalRamMB <= 300)  return micro;
    if (_totalRamMB < 512)   return tiny;
    if (_totalRamMB < 2048)  return low;
    if (_totalRamMB < 8192)  return mid;
    if (_totalRamMB < 65536) return high;
    return ultra;
}

const settings = {
  packname: 'Truth ᴍᴅ',
  author: 'Courtney',
  botName: "TRUTH md",
  botOwner: '',
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",
  maxStoreMessages:  _scale(2,     5,    15,   50,   200,  500),
  maxStoreChats:     _scale(30,    300,  1000, 5000, 20000, 50000),
  maxStoreContacts:  _scale(50,    500,  2000, 10000, 50000, 100000),
  storeWriteInterval: _scale(180000, 120000, 60000, 30000, 15000, 10000),
  msgBackupDebounce:  _scale(300000, 120000, 60000, 30000, 15000, 10000),
  msgBackupMaxChats:  _scale(0,     5,     100,  500,  2000,  10000),
  groupMetaCacheTTL:  _scale(180000, 300000, 300000, 600000, 900000, 1200000),
  groupMetaCacheMax:  _scale(30,    200,   500,  2000, 5000,  10000),
  description: "This is a bot for managing group commands and automating tasks.",
  version: "2.4.0",
  defaultPrefix: ".",
  defaultMenuStyle: "5",
  updateZipUrl: process.env.UPDATE_ZIP_URL || "https://truthx.courtneytech.xyz/api/repo",
  relayKey: process.env.RELAY_KEY || process.env.ACCESS_KEY || 'techworld_secure_2026',
  githubRepo: "mzeeemzimanjejeje/Maintaining",
  publicRepo: process.env.PUBLIC_REPO || '',
  ramMB: _totalRamMB,
};

Object.defineProperty(settings, 'ownerNumber', {
    get() {
        return (global.OWNER_NUMBER || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    },
    enumerable: true,
    configurable: true,
});

module.exports = settings;
