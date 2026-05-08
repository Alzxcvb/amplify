# Campaign Schema — amplify

## JSON Format

```json
{
  "id": "arrival-pass",
  "product": "Arrival Pass",
  "url": "https://arrivalpass.app",
  "pitch": "iOS app that autofills Malaysia's Digital Arrival Card (MDAC) in one tap. Saves your passport info, travel details, and address so you never fill the form by hand again.",
  "pain_points": [
    "malaysia digital arrival card",
    "mdac",
    "trouble filling arrival card",
    "malaysia arrival form",
    "digital arrival card malaysia",
    "mdac help",
    "arrival card problem",
    "customs form malaysia"
  ],
  "ai_url": "https://chatgpt.com/g/g-XXXXXXXX/c/XXXXXXXX",
  "active": true,
  "platforms": {
    "reddit": [
      "r/malaysia",
      "r/kualalumpur",
      "r/digitalnomad",
      "r/travel",
      "r/solotravel",
      "r/expats",
      "r/backpacking"
    ],
    "instagram": [],
    "facebook": []
  }
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique slug, used for --campaign= flag and DB keys |
| product | string | Product display name |
| url | string | Product URL to include in replies |
| pitch | string | 1-2 sentence description of what it does and who it's for |
| pain_points | string[] | Keywords/phrases that indicate someone has the pain point |
| platforms | object | Keys are platform names, values are arrays of target locations |
| active | boolean | If false, campaign is skipped |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| ai_url | string | https://claude.ai/new | URL of ChatGPT custom GPT or Claude.ai for AI calls |
| max_replies_per_hour | number | 5 | Override global rate limit for this campaign |
| confidence_threshold | number | 8 | Minimum confidence to post (1-10) |

## Platform Location Format

- Reddit: `r/subredditname` (no full URL needed, bot constructs it)
- Instagram: `#hashtag` or `@username` (future)
- Facebook: group name string (future)
