# Classifier Prompt Spec — amplify

## Purpose

The classifier prompt is sent to the AI browser interface. It must:
1. Determine if the post/comment represents a genuine pain point the product solves
2. If yes, generate a natural, helpful reply that mentions the product
3. Return structured JSON so the bot can parse the result

## Prompt Template

```
You are analyzing a social media comment to see if this person needs a specific product.

PRODUCT: {campaign.product}
PRODUCT URL: {campaign.url}
WHAT IT DOES: {campaign.pitch}
PAIN POINTS IT SOLVES: {campaign.pain_points.join(', ')}

COMMENT FROM {post.author} on {post.platform}:
---
{post.commentBody}
---

POST CONTEXT (title/body):
---
{post.title || ''} {post.body || ''}
---

TASK:
1. Does this person have one of the pain points listed above? Rate confidence 1-10.
2. If confidence >= 8: write a short, natural reply (2-4 sentences) that:
   - Acknowledges their specific struggle (don't be generic)
   - Mentions the product name and URL naturally
   - Sounds like a helpful fellow user, NOT a bot or ad
   - Does NOT say "I made this" or sound promotional
   - Does NOT use phrases like "game changer", "check it out", "amazing tool"
3. If confidence < 8: skip.

Respond ONLY with valid JSON (no markdown, no explanation):
{"match": true/false, "confidence": 1-10, "reply": "the reply text or null", "reason": "one sentence why"}
```

## Example Output (Good)

```json
{
  "match": true,
  "confidence": 9,
  "reply": "Filling out the MDAC every trip used to take me forever too. I've been using Arrival Pass lately — saves my info so it's basically one tap next time. Free to try if you want to give it a shot: arrivalpass.app",
  "reason": "User explicitly says they struggled with the Malaysia arrival card form"
}
```

## Example Output (Skip)

```json
{
  "match": false,
  "confidence": 3,
  "reply": null,
  "reason": "User is asking about visa requirements, not the arrival card form specifically"
}
```

## Parsing

The bot must parse the JSON response from the AI. Because LLMs sometimes wrap JSON in markdown code blocks, strip any leading ` ```json ` or trailing ` ``` ` before parsing.

If parsing fails after stripping, return: `{match: false, confidence: 0, reply: null, reason: 'parse_error'}`
