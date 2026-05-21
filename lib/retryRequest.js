const axios = require('axios');

/**
 * retryRequest — wraps an axios GET with automatic retries.
 * @param {string} url
 * @param {object} options   axios config
 * @param {number} retries   total attempts (default 3)
 * @param {number} delay     ms between retries (default 1500)
 */
async function retryRequest(url, options = {}, retries = 2, delay = 800) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...options });
            return res;
        } catch (err) {
            lastErr = err;
            const isLast = attempt === retries;
            if (!isLast) {
                await new Promise(r => setTimeout(r, delay * attempt));
            }
        }
    }
    throw lastErr;
}

/**
 * retryPost — wraps an axios POST with automatic retries.
 */
async function retryPost(url, data, options = {}, retries = 2, delay = 800) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.post(url, data, { timeout: 8000, headers: { 'Content-Type': 'application/json' }, ...options });
            return res;
        } catch (err) {
            lastErr = err;
            const isLast = attempt === retries;
            if (!isLast) {
                await new Promise(r => setTimeout(r, delay * attempt));
            }
        }
    }
    throw lastErr;
}

module.exports = { retryRequest, retryPost };
