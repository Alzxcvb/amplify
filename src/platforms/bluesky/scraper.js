'use strict';

const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'amplify/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        try { resolve(JSON.parse(data)); } catch { reject(new Error('BlueSky JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('BlueSky request timeout')); });
  });
}

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('BlueSky post timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// Public search — no auth required
async function scrapeBlueSkySearch(query, limit = 25) {
  const encoded = encodeURIComponent(query);
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encoded}&limit=${limit}&sort=latest`;

  let data;
  try {
    data = await httpsGet(url);
  } catch (err) {
    console.warn(`[bluesky] Search failed for "${query}": ${err.message}`);
    return [];
  }

  if (!data.posts || !Array.isArray(data.posts)) return [];

  return data.posts
    .filter(p => p.record && p.record.text && p.record.text.length > 20)
    .map(p => ({
      id: p.uri,
      url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
      title: '',
      body: p.record.text || '',
      author: p.author.handle,
      platform: 'bluesky',
      subreddit: 'bluesky',
      postedAt: p.record.createdAt ? Math.floor(new Date(p.record.createdAt).getTime() / 1000) : null,
      _uri: p.uri,
      _cid: p.cid,
      _authorDid: p.author.did,
    }));
}

// Trend signals — extract hashtags from recent posts
async function scrapeBlueSkyTrends(topics) {
  const trends = [];
  for (const topic of topics) {
    const posts = await scrapeBlueSkySearch(topic, 10);
    if (posts.length > 0) {
      trends.push({ platform: 'bluesky', topic, signalCount: posts.length, sample: posts[0].body.slice(0, 100) });
    }
  }
  return trends;
}

// Post a reply — requires app password auth
async function postBlueSkyReply(identifier, appPassword, postUri, postCid, replyText) {
  if (!identifier || !appPassword) throw new Error('BlueSky: BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD env vars required');

  // Create session
  const sessionRes = await httpsPost('bsky.social', '/xrpc/com.atproto.server.createSession', {
    identifier,
    password: appPassword,
  });

  if (sessionRes.status !== 200) throw new Error(`BlueSky login failed: ${JSON.stringify(sessionRes.body)}`);
  const { accessJwt, did } = sessionRes.body;

  // Post reply
  const replyRes = await httpsPost('bsky.social', '/xrpc/com.atproto.repo.createRecord', {
    repo: did,
    collection: 'app.bsky.feed.post',
    record: {
      '$type': 'app.bsky.feed.post',
      text: replyText,
      reply: { root: { uri: postUri, cid: postCid }, parent: { uri: postUri, cid: postCid } },
      createdAt: new Date().toISOString(),
    },
  }, { Authorization: `Bearer ${accessJwt}` });

  if (replyRes.status !== 200) throw new Error(`BlueSky post failed: ${JSON.stringify(replyRes.body)}`);
  return replyRes.body;
}

module.exports = { scrapeBlueSkySearch, scrapeBlueSkyTrends, postBlueSkyReply };
