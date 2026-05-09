'use strict';

const { askGroq } = require('../ai/groq-client');
const { askClaude } = require('../ai/claude-browser');

async function callAI(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (key) return askGroq(prompt, key);
  throw new Error('GROQ_API_KEY not set and browser AI unavailable');
}

function parseJsonArray(raw) {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

// Discover new subreddits. allTried = every subreddit ever queued; flagged = ones that bombed.
async function discoverSubreddits(browser, campaign, flaggedList, allTried = []) {
  const neverRepeat = [...new Set([...allTried, ...flaggedList])];
  const flaggedStr = flaggedList.length > 0 ? flaggedList.join(', ') : 'none';
  const painPoints = (campaign.pain_points || []).slice(0, 6).join(', ');

  const prompt =
    `I'm promoting "${campaign.product}": ${campaign.pitch}\n\n` +
    `Pain points it solves: ${painPoints}\n\n` +
    `Subreddits already in my list (do NOT repeat any of these): ${neverRepeat.join(', ') || 'none yet'}\n` +
    `Subreddits that were low-quality/irrelevant: ${flaggedStr}\n\n` +
    `Suggest 5 DIFFERENT subreddits where people post about these pain points. Think:\n` +
    `- Country/region-specific travel or expat communities\n` +
    `- Nomad, remote-work, or frequent-flyer communities\n` +
    `- Communities specific to the destination country\n` +
    `- Topic-specific subreddits (immigration, visas, border crossings)\n\n` +
    `Return ONLY a JSON array: ["r/name1","r/name2","r/name3","r/name4","r/name5"]`;

  let raw;
  try {
    raw = await callAI(prompt);
  } catch {
    try { raw = await askClaude(browser, prompt, campaign.ai_url); } catch { return []; }
  }

  const parsed = parseJsonArray(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(s => typeof s === 'string' && s.startsWith('r/') && !neverRepeat.includes(s))
    .slice(0, 5);
}

// Discover new keyword search queries not yet tried.
async function discoverKeywords(campaign, triedKeywords = []) {
  const allTried = [...new Set([...(campaign.pain_points || []), ...triedKeywords])];

  const prompt =
    `I'm searching Reddit for people who need "${campaign.product}": ${campaign.pitch}\n\n` +
    `Keywords/phrases already searched: ${allTried.join(', ')}\n\n` +
    `Suggest 5 NEW search queries that someone experiencing these pain points might actually type on Reddit.\n` +
    `Think about: frustrated rants, help requests, questions before a trip, error messages they might quote.\n` +
    `Keep them natural and specific — phrases real users write, not marketing language.\n\n` +
    `Return ONLY a JSON array: ["query one","query two","query three","query four","query five"]`;

  try {
    const raw = await callAI(prompt);
    const parsed = parseJsonArray(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(s => typeof s === 'string' && s.trim().length > 3 && !allTried.includes(s.trim()))
      .map(s => s.trim())
      .slice(0, 5);
  } catch {
    return [];
  }
}

module.exports = { discoverSubreddits, discoverKeywords };
