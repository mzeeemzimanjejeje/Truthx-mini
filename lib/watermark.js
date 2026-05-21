const fs = require('fs');
const path = require('path');

const WATERMARK_FILE = path.join(__dirname, '..', 'data', 'water.json');
const DEFAULT_WATERMARK = 'Truth MD is on fire 🔥🚒';

function getWatermarkText() {
    try {
        if (fs.existsSync(WATERMARK_FILE)) {
            const text = fs.readFileSync(WATERMARK_FILE, 'utf8').trim();
            // Reject empty, bare JSON objects/arrays, or whitespace-only values
            if (text && text !== '{}' && text !== '[]' && !/^\{[\s]*\}$/.test(text)) {
                return text;
            }
        }
    } catch (_) {}
    return DEFAULT_WATERMARK;
}

async function addImageWatermark(inputBuffer) {
    return inputBuffer;
}

function addVideoWatermark(inputPath) {
    return Promise.resolve(inputPath);
}

function appendWatermark(caption) {
    const wm = getWatermarkText();
    if (!caption) return wm;
    return `${caption}\n${wm}`;
}

module.exports = { addImageWatermark, addVideoWatermark, getWatermarkText, appendWatermark };
