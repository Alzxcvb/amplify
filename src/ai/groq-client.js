'use strict';

const https = require('https');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile: best quality, generous free tier
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function post(url, apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error(`Groq: failed to parse response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Groq: request timeout')); });
    req.write(payload);
    req.end();
  });
}

async function askGroq(promptText, apiKey, model = DEFAULT_MODEL) {
  const result = await post(GROQ_API_URL, apiKey, {
    model,
    messages: [{ role: 'user', content: promptText }],
    temperature: 0.3,
    max_tokens: 512,
  });

  if (result.status === 429) {
    throw new Error('Groq: rate limited — try again in a moment');
  }
  if (result.status !== 200) {
    throw new Error(`Groq: API error ${result.status}: ${result.body?.error?.message || JSON.stringify(result.body)}`);
  }

  const text = result.body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq: empty response');
  return text.trim();
}

module.exports = { askGroq };
