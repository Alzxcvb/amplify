'use strict';

// Triangle distribution: average of 2 uniforms clusters near the middle, with natural tails.
// Looks more human than a flat random.
function jitter(minMs, maxMs) {
  const r = (Math.random() + Math.random()) / 2;
  return Math.floor(minMs + r * (maxMs - minMs));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// After a page load — simulates glancing at the page before doing anything (1.5-4s)
async function afterPageLoad() {
  await sleep(jitter(1500, 4000));
}

// Between navigating to different subreddits/search pages (3-10s)
async function betweenPages() {
  await sleep(jitter(3000, 10000));
}

// Scanning through comments — simulates eye-movement between items (0.6-2.5s)
async function readingPause() {
  await sleep(jitter(600, 2500));
}

// Before composing a reply — simulates thinking/drafting (5-14s)
async function thinkingPause() {
  await sleep(jitter(5000, 14000));
}

// Scroll pause — between scroll steps (0.7-2s)
async function scrollPause() {
  await sleep(jitter(700, 2000));
}

// After clicking a button or submitting (1.5-3.5s)
async function afterAction() {
  await sleep(jitter(1500, 3500));
}

module.exports = { jitter, sleep, afterPageLoad, betweenPages, readingPause, thinkingPause, scrollPause, afterAction };
