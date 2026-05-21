const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');

async function tryUguu(filePath) {
    const form = new FormData();
    form.append('files[]', fs.createReadStream(filePath));

    const res = await axios.post('https://uguu.se/upload', form, {
        headers: form.getHeaders(),
        timeout: 60000
    });

    if (res.data) {
        if (typeof res.data === 'string' && res.data.startsWith('http')) return res.data.trim();
        if (Array.isArray(res.data.files) && res.data.files[0]?.url) return res.data.files[0].url;
        if (res.data.url) return res.data.url;
    }
    throw new Error('Uguu: unexpected response format');
}

async function tryCatbox(filePath) {
    const form = new FormData();
    form.append('fileToUpload', fs.createReadStream(filePath));
    form.append('reqtype', 'fileupload');

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 60000
    });

    if (typeof res.data === 'string' && res.data.startsWith('https://')) return res.data.trim();
    throw new Error('Catbox: unexpected response format');
}

async function UploadFileUgu(filePath) {
    try {
        return await tryUguu(filePath);
    } catch (e1) {
        console.error('[UPLOAD] Uguu failed:', e1.message, '— trying Catbox...');
    }

    try {
        return await tryCatbox(filePath);
    } catch (e2) {
        console.error('[UPLOAD] Catbox failed:', e2.message);
        throw new Error('Upload failed on all hosts');
    }
}

module.exports = { UploadFileUgu };
