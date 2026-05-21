const axios = require("axios");
const { retryRequest, retryPost } = require('../lib/retryRequest');
const { fallbackManager } = require('../lib/apiFallbacks');

const DC = 'https://apis.davidcyril.name.ng';

const AI_MODELS = {
    aichat: {
        name: 'AI Chatbot',
        endpoints: [
            { url: `${DC}/ai/chatbot`, method: 'GET', param: 'query', extract: d => d.message || d.response || d.result },
        ]
    },
    gpt3: {
        name: 'GPT-3',
        endpoints: [
            { url: `${DC}/ai/gpt3`, method: 'GET', param: 'text', extract: d => d.message || d.response },
            { url: `https://apis.xwolf.space/api/ai/gpt`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response || d.message },
        ]
    },
    gpt: {
        name: 'GPT',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/gpt`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response || d.message },
            { url: `${DC}/ai/gpt3`, method: 'GET', param: 'text', extract: d => d.message || d.response },
        ]
    },
    gpt4: {
        name: 'GPT-4',
        endpoints: [
            { url: `${DC}/ai/gpt4`, method: 'GET', param: 'text', extract: d => d.message || d.response },
            { url: `https://apis.xwolf.space/api/ai/gpt`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
    gpt4mini: {
        name: 'GPT-4o Mini',
        endpoints: [
            { url: `${DC}/ai/gpt4omini`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    gemini: {
        name: 'Gemini',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/gemini`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response || d.message },
            { url: `${DC}/ai/gemini`, method: 'GET', param: 'text', extract: d => d.message || d.response },
        ]
    },
    llama3: {
        name: 'Llama 3',
        endpoints: [
            { url: `${DC}/ai/llama3`, method: 'GET', param: 'text', extract: d => d.message || d.response },
        ]
    },
    deepseek: {
        name: 'DeepSeek V3',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/deepseek`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
            { url: `${DC}/ai/deepseek-v3`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    deepseekr1: {
        name: 'DeepSeek R1',
        endpoints: [
            { url: `${DC}/ai/deepseek-r1`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    deepseek67b: {
        name: 'DeepSeek 67B',
        endpoints: [
            { url: `${DC}/ai/deepseek-llm-67b-chat`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    metaai: {
        name: 'Meta AI',
        endpoints: [
            { url: `${DC}/ai/metaai`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    gemma: {
        name: 'Gemma',
        endpoints: [
            { url: `${DC}/ai/gemma`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    qvq: {
        name: 'QVQ 72B',
        endpoints: [
            { url: `${DC}/ai/qvq`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    mixtral: {
        name: 'Mixtral',
        endpoints: [
            { url: `${DC}/ai/mixtral`, method: 'GET', param: 'text', extract: d => d.response || d.message },
        ]
    },
    mistral: {
        name: 'Mistral',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/mistral`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
    cohere: {
        name: 'Cohere',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/cohere`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
    claude: {
        name: 'Claude',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/claude`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
    venice: {
        name: 'Venice',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/venice`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
    groq: {
        name: 'Groq',
        endpoints: [
            { url: `https://apis.xwolf.space/api/ai/groq`, method: 'POST', body: q => ({ prompt: q }), extract: d => d.result || d.response },
        ]
    },
};

async function callEndpoint(endpoint, query) {
    if (endpoint.method === 'GET') {
        const url = `${endpoint.url}?${endpoint.param || 'text'}=${encodeURIComponent(query)}`;
        const res = await retryRequest(url, { timeout: 60000 }, 3, 1000);
        if (!res?.data?.success) throw new Error('API returned success=false');
        const answer = endpoint.extract(res.data);
        if (!answer) throw new Error('No answer in response');
        return answer;
    } else {
        const res = await retryPost(endpoint.url, endpoint.body(query), {}, 3, 1000);
        if (!res.data || (!res.data.success && !res.data.status)) throw new Error('API returned unsuccessful response');
        const answer = endpoint.extract(res.data);
        if (!answer) throw new Error('No answer in response');
        return answer;
    }
}

async function aiCommand(sock, chatId, message, modelKey) {
    let query = '';
    const model = AI_MODELS[modelKey] || AI_MODELS.gpt;

    try {
        await sock.sendMessage(chatId, { react: { text: '🛰️', key: message.key } });

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const parts = text.split(' ');
        query = parts.slice(1).join(' ').trim();

        if (!query) {
            const modelList = Object.keys(AI_MODELS).map(k => `.${k}`).join(', ');
            return await sock.sendMessage(chatId, {
                text: `Please provide a question.\n\nExample: .${modelKey || 'gpt'} write a basic html code\n\nAvailable AI models: ${modelList}`
            }, { quoted: message });
        }

        let answer = null;
        let usedEndpoint = null;

        for (const ep of model.endpoints) {
            try {
                answer = await callEndpoint(ep, query);
                usedEndpoint = ep.url;
                break;
            } catch (epErr) {
                console.error(`[AI/${modelKey}] Endpoint ${ep.url} failed: ${epErr.message}`);
            }
        }

        if (!answer) {
            console.log(`[AI/${modelKey}] All primary endpoints failed, trying fallbacks...`);
            const fallbackResult = await fallbackManager.tryFallbacks('ai_chat', query);
            if (fallbackResult.success) {
                await sock.sendMessage(chatId, {
                    text: `*${model.name} (via fallback — ${fallbackResult.api}):*\n\n${fallbackResult.data}`
                }, { quoted: message });
                await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
                return;
            }
            throw new Error('All endpoints and fallbacks failed');
        }

        await sock.sendMessage(chatId, {
            text: `*${model.name}:*\n\n${answer}`
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error(`AI (${modelKey}) error:`, err.message);
        await sock.sendMessage(chatId, {
            text: `❎ Error with ${model.name}: ${err.message}\n\n🔄 All fallback APIs also failed. Please try again later.`
        }, { quoted: message });
    }
}

module.exports = aiCommand;
module.exports.AI_MODELS = AI_MODELS;
