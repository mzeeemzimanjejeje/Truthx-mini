const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class APIFallbackManager {
    constructor() {
        this.fallbacks = {
            ai_chat: [
                {
                    name: 'GPT-5 (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/gpt-5?text=',
                    method: 'GET',
                    responsePath: 'text',
                    timeout: 30000
                },
                {
                    name: 'DeepSeek Chat (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/deepseekchat?prompt=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Copilot (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/copilot?text=',
                    method: 'GET',
                    responsePath: 'text',
                    timeout: 30000
                },
                {
                    name: 'Gemini (GiftedTech)',
                    endpoint: 'https://api.giftedtech.co.ke/api/ai/gemini?apikey=gifted&q=',
                    method: 'GET',
                    responsePath: 'result',
                    timeout: 30000
                },
                {
                    name: 'GPT-4o (GiftedTech)',
                    endpoint: 'https://api.giftedtech.co.ke/api/ai/gpt4o?apikey=gifted&q=',
                    method: 'GET',
                    responsePath: 'result',
                    timeout: 30000
                },
                {
                    name: 'Gemini (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/gemini?text=',
                    method: 'GET',
                    responsePath: 'message',
                    timeout: 30000
                },
                {
                    name: 'GPT-4 (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/gpt4?text=',
                    method: 'GET',
                    responsePath: 'message',
                    timeout: 30000
                },
                {
                    name: 'GPT-4o Mini (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/gpt4omini?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'DeepSeek V3 (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/deepseek-v3?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'DeepSeek R1 (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/deepseek-r1?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Llama 3 (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/llama3?text=',
                    method: 'GET',
                    responsePath: 'message',
                    timeout: 30000
                },
                {
                    name: 'Meta AI (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/metaai?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Mixtral (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/mixtral?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Gemma (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/gemma?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'QVQ 72B (DavidCyril)',
                    endpoint: 'https://apis.davidcyril.name.ng/ai/qvq?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                }
            ],

            image_generation: [
                {
                    name: 'txt2img (GiftedTech)',
                    endpoint: 'https://api.giftedtech.co.ke/api/ai/txt2img?apikey=gifted&prompt=',
                    method: 'GET',
                    responseType: 'url',
                    responsePath: 'result.url',
                    timeout: 45000
                },
                {
                    name: 'Stable Diffusion XL (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/image--cf-bytedance-stable-diffusion-xl-lightning?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                },
                {
                    name: 'Flux 1 Schnell (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/image--cf-black-forest-labs-flux-1-schnell?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                },
                {
                    name: 'DALL-E 3 XL (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/dalle?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                }
            ],

            tts: [
                {
                    name: 'TTS English (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/tts/tts-en?text=',
                    method: 'GET',
                    responseType: 'audio',
                    timeout: 30000
                },
                {
                    name: 'TTS Indonesian (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/tts/tts-id?text=',
                    method: 'GET',
                    responseType: 'audio',
                    timeout: 30000
                }
            ],

            // Media upload APIs (POST with form-data, buffer input, returns hosted URL)
            // Usage: fallbackManager.uploadMedia(buffer, filename, mimetype)
            image_upload: [
                {
                    name: 'GiftedTech CDN (ghbcdn)',
                    url: 'https://ghbcdn.giftedtech.co.ke/api/upload.php',
                    method: 'POST',
                    fieldName: 'file',
                    responsePath: 'url',
                    timeout: 30000
                },
                {
                    name: 'GiftedTech CDN (cdn)',
                    url: 'https://cdn.giftedtech.co.ke/api/upload.php',
                    method: 'POST',
                    fieldName: 'file',
                    responsePath: 'url',
                    timeout: 30000
                },
                {
                    name: 'Catbox',
                    url: 'https://catbox.moe/user/api.php',
                    method: 'POST',
                    fieldName: 'fileToUpload',
                    extraFields: { reqtype: 'fileupload' },
                    responsePath: null,
                    responseText: true,
                    timeout: 30000
                },
                {
                    name: 'Pixhost',
                    url: 'https://api.pixhost.to/images',
                    method: 'POST',
                    fieldName: 'img',
                    extraFields: { content_type: '0' },
                    responsePath: 'show_url',
                    timeout: 30000
                },
                {
                    name: 'ImgBB',
                    url: 'https://api.imgbb.com/1/upload?key=bbc0c59714520ebcd0af58caf995bd08',
                    method: 'POST',
                    fieldName: 'image',
                    encodeBase64: true,
                    responsePath: 'data.url',
                    timeout: 30000
                }
            ]
        };

        this.loadCustomAPIs();
    }

    async tryFallbacks(category, query, options = {}) {
        const apis = this.fallbacks[category];
        if (!apis) {
            return { success: false, error: `No fallback APIs found for category: ${category}` };
        }

        for (const api of apis) {
            try {
                console.log(`🔄 Trying fallback API: ${api.name}`);
                const result = await this.callAPI(api, query, options);
                if (result.success) {
                    console.log(`✅ Fallback API succeeded: ${api.name}`);
                    return { success: true, data: result.data, api: api.name };
                }
            } catch (error) {
                console.log(`❌ Fallback API failed: ${api.name} - ${error.message}`);
                continue;
            }
        }

        return { success: false, error: `All fallback APIs failed for category: ${category}` };
    }

    async callAPI(api, query, options = {}) {
        const url = api.endpoint + encodeURIComponent(query);

        const config = {
            method: api.method,
            timeout: api.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...options.headers
            }
        };

        if (api.responseType === 'buffer') {
            config.responseType = 'arraybuffer';
        }

        const response = await axios(url, config);

        if (api.responseType === 'buffer') {
            return { success: true, data: Buffer.from(response.data) };
        }

        if (api.responseType === 'url') {
            // Response is JSON with a URL — fetch the URL and return as buffer
            const data = response.data;
            if (!data?.success) throw new Error('API returned failure');
            const imgUrl = this._deepGet(data, api.responsePath);
            if (!imgUrl) throw new Error('No image URL in response');
            const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: api.timeout });
            return { success: true, data: Buffer.from(imgRes.data) };
        }

        const data = response.data;
        if (data && data.success !== false) {
            const result = api.responsePath ? data[api.responsePath] : data;
            if (result) return { success: true, data: result };
        }

        throw new Error('Invalid API response format');
    }

    // Upload a media buffer to a hosting service, returns a public URL
    async uploadMedia(buffer, filename = 'file.jpg', mimetype = 'image/jpeg') {
        const apis = this.fallbacks.image_upload || [];

        for (const api of apis) {
            try {
                console.log(`🔄 Trying upload API: ${api.name}`);
                const url = await this._uploadToHost(api, buffer, filename, mimetype);
                if (url) {
                    console.log(`✅ Upload succeeded via ${api.name}: ${url}`);
                    return { success: true, url, api: api.name };
                }
            } catch (e) {
                console.log(`❌ Upload failed (${api.name}): ${e.message}`);
            }
        }

        return { success: false, error: 'All upload APIs failed' };
    }

    async _uploadToHost(api, buffer, filename, mimetype) {
        const form = new FormData();

        if (api.extraFields) {
            for (const [k, v] of Object.entries(api.extraFields)) form.append(k, v);
        }

        if (api.encodeBase64) {
            form.append(api.fieldName, buffer.toString('base64'));
        } else {
            form.append(api.fieldName, buffer, { filename, contentType: mimetype });
        }

        const res = await axios.post(api.url, form, {
            headers: { ...form.getHeaders() },
            timeout: api.timeout
        });

        if (api.responseText) return res.data?.trim ? res.data.trim() : String(res.data).trim();
        return this._deepGet(res.data, api.responsePath);
    }

    _deepGet(obj, path) {
        if (!path) return obj;
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    }

    loadCustomAPIs() {
        try {
            const apiStoragePath = path.join(__dirname, '..', 'data', 'custom_apis.json');
            const dataDir = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

            if (fs.existsSync(apiStoragePath)) {
                const customAPIs = JSON.parse(fs.readFileSync(apiStoragePath, 'utf8'));
                console.log('📂 Custom APIs file found. Loading...');
                for (const [category, apis] of Object.entries(customAPIs)) {
                    if (!this.fallbacks[category]) this.fallbacks[category] = [];
                    this.fallbacks[category].push(...apis);
                }
                console.log(`✅ Loaded custom APIs from storage - ${Object.keys(customAPIs).length} categories`);
            } else {
                console.log('ℹ️ No custom APIs file found. Using defaults only.');
            }
        } catch (error) {
            console.error('❌ Error loading custom APIs:', error.message);
        }
    }

    saveCustomAPIs() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            const apiStoragePath = path.join(dataDir, 'custom_apis.json');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

            const defaultNames = {
                'ai_chat': ['GPT-5 (PrexzyVilla)', 'DeepSeek Chat (PrexzyVilla)', 'Copilot (PrexzyVilla)', 'Gemini (GiftedTech)', 'GPT-4o (GiftedTech)', 'Gemini (DavidCyril)', 'GPT-4 (DavidCyril)', 'GPT-4o Mini (DavidCyril)', 'DeepSeek V3 (DavidCyril)', 'DeepSeek R1 (DavidCyril)', 'Llama 3 (DavidCyril)', 'Meta AI (DavidCyril)', 'Mixtral (DavidCyril)', 'Gemma (DavidCyril)', 'QVQ 72B (DavidCyril)'],
                'image_generation': ['txt2img (GiftedTech)', 'Stable Diffusion XL (PrexzyVilla)', 'Flux 1 Schnell (PrexzyVilla)', 'DALL-E 3 XL (PrexzyVilla)'],
                'tts': ['TTS English (PrexzyVilla)', 'TTS Indonesian (PrexzyVilla)'],
                'image_upload': ['GiftedTech CDN (ghbcdn)', 'GiftedTech CDN (cdn)', 'Catbox', 'Pixhost', 'ImgBB']
            };

            const customAPIs = {};
            for (const [category, apis] of Object.entries(this.fallbacks)) {
                const customOnes = apis.filter(api => !defaultNames[category]?.includes(api.name));
                if (customOnes.length > 0) customAPIs[category] = customOnes;
            }

            fs.writeFileSync(apiStoragePath, JSON.stringify(customAPIs, null, 2));
            console.log(`💾 Custom APIs saved to ${apiStoragePath}`);
        } catch (error) {
            console.error('❌ Error saving custom APIs:', error.message);
        }
    }

    getDefaultAPIs(category) {
        const defaults = {
            ai_chat: [
                { name: 'GPT-5 (PrexzyVilla)' }, { name: 'DeepSeek Chat (PrexzyVilla)' },
                { name: 'Copilot (PrexzyVilla)' }, { name: 'Gemini (GiftedTech)' }, { name: 'GPT-4o (GiftedTech)' }
            ],
            image_generation: [
                { name: 'txt2img (GiftedTech)' }, { name: 'Stable Diffusion XL (PrexzyVilla)' },
                { name: 'Flux 1 Schnell (PrexzyVilla)' }, { name: 'DALL-E 3 XL (PrexzyVilla)' }
            ],
            tts: [{ name: 'TTS English (PrexzyVilla)' }, { name: 'TTS Indonesian (PrexzyVilla)' }],
            image_upload: [
                { name: 'GiftedTech CDN (ghbcdn)' }, { name: 'GiftedTech CDN (cdn)' },
                { name: 'Catbox' }, { name: 'Pixhost' }, { name: 'ImgBB' }
            ]
        };
        return defaults[category] || [];
    }

    addFallback(category, apiConfig) {
        if (!this.fallbacks[category]) this.fallbacks[category] = [];
        this.fallbacks[category].push(apiConfig);
        this.saveCustomAPIs();
    }

    getAvailableAPIs(category) {
        return this.fallbacks[category]?.map(api => api.name) || [];
    }
}

const fallbackManager = new APIFallbackManager();

module.exports = { APIFallbackManager, fallbackManager };
