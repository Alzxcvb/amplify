# AI Interface Spec — amplify

## Overview

All AI calls go through a real browser session — no API keys. This mirrors the existing AppleScript approach (LinkedIn bot uses Safari + Firefox + ChatGPT custom GPT URL).

Playwright opens a new tab to a configured AI URL, types the prompt, waits for the response to finish streaming, extracts the text, and closes the tab.

## AI URL Configuration

Each campaign can specify its own AI URL in the campaign JSON:

```json
{
  "ai_url": "https://chatgpt.com/g/g-XXXXXXXX/c/XXXXXXXX"
}
```

If no `ai_url` is set, default to `https://claude.ai/new`.

The custom GPT URL approach (as used in the LinkedIn bot) is preferred because:
- GPT is already tuned for the right persona and reply style
- No need to re-inject system prompt every call
- Faster (shorter prompt = faster response)

## askClaude(browser, promptText, aiUrl) — src/ai/claude-browser.js

### Steps

1. Open new tab: `const page = await browser.newPage()`
2. Navigate: `await page.goto(aiUrl, {waitUntil: 'networkidle', timeout: 30000})`
3. Find input — try selectors in order:
   - `div[contenteditable="true"]` (Claude.ai)
   - `[data-testid="chat-input"]` (Claude.ai alt)
   - `#prompt-textarea` (ChatGPT)
   - `textarea` (fallback)
4. Click the input to focus it
5. Type prompt: `await page.keyboard.type(promptText, {delay: 80})`
   - Do NOT use `fill()` — triggers anti-bot on both platforms
6. Send: try `Enter` key first, fall back to clicking send button
7. Wait for response to start appearing (poll for new content every 500ms, timeout 60s)
8. Wait for response to STOP streaming: poll for content stability (same text for 3 consecutive 1.5s polls)
9. Extract response text — try in order:
   - Last `[data-testid="assistant-message"]` (Claude.ai)
   - Last `.message.assistant .text` (Claude.ai alt)
   - Last `.markdown` inside a `.group` (ChatGPT)
   - Last `[data-message-author-role="assistant"]` (ChatGPT alt)
   - Fallback: last block of text in the conversation area
10. Close tab: `await page.close()`
11. Return extracted text as string

### Error Handling

- Navigation timeout (30s): throw Error('AI_NAV_TIMEOUT')
- Input not found (10s): throw Error('AI_INPUT_NOT_FOUND')
- Response timeout (60s): throw Error('AI_RESPONSE_TIMEOUT')
- Empty response: throw Error('AI_EMPTY_RESPONSE')

### Typing vs Clipboard

For long prompts (>500 chars), use clipboard approach instead of keyboard.type():
```js
await page.evaluate(text => navigator.clipboard.writeText(text), promptText);
await page.keyboard.down('Meta');
await page.keyboard.press('v');
await page.keyboard.up('Meta');
```
This is faster and avoids timeout on very long posts.
