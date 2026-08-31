# redessociales — Wellness Social-Media Image Agent

Generates paired **English/Spanish** vertical (9:16) wellness quote images for social media, powered by [Ideogram.ai](https://ideogram.ai).

## Quick Start

```bash
# 1. Install dependencies
pip install -r agent/requirements.txt

# 2. Set your Ideogram API key
cp .env.example .env
# Edit .env and add your key: IDEOGRAM_API_KEY=your_key_here
export $(cat .env | xargs)   # Linux/macOS
# Or: $env:IDEOGRAM_API_KEY="your_key_here"  # PowerShell

# 3. Generate a random quote image pair
python agent/wellness_agent.py

# 4. Generate a specific category
python agent/wellness_agent.py --category mindfulness

# 5. Generate a specific quote by ID
python agent/wellness_agent.py --quote-id mf-01 --template a

# 6. Batch-generate ALL quotes
python agent/wellness_agent.py --all

# 7. Dry-run (no API calls, just prints prompts)
python agent/wellness_agent.py --dry-run
```

## Project Structure

```
redessociales/
├── messages/
│   └── wellness_bank.json      # 19 bilingual EN/ES wellness quotes (5 categories)
├── prompts/
│   └── image_prompts.yaml      # Reusable Ideogram prompt templates (A/B/C styles)
├── agent/
│   ├── wellness_agent.py       # Main orchestrator
│   └── requirements.txt        # Python dependencies
├── docs/
│   ├── approval_rules.md       # Human review checklist before publishing
│   └── publishing_handoff.md   # Buffer / manual posting guide
├── output/
│   ├── pending/                # Generated images awaiting review (git-ignored)
│   ├── approved/               # Approved images ready to publish (git-ignored)
│   └── published/              # Archive after posting (git-ignored)
├── .env.example                # API key placeholder
└── .gitignore
```

## Workflow

```
Generate → output/pending/ → Approve (docs/approval_rules.md) → output/approved/ → Publish (docs/publishing_handoff.md)
```

## Categories & Quote IDs

| Category | IDs |
|----------|-----|
| mindfulness | mf-01 … mf-04 |
| nutrition | nt-01 … nt-04 |
| movement | mv-01 … mv-04 |
| sleep | sl-01 … sl-04 |
| mental_health | mh-01 … mh-05 |

## Image Templates

| Template | Style | Default categories |
|----------|-------|--------------------|
| A | Centered minimalist, soft gradient | mindfulness, mental_health |
| B | Bold accent, geometric shapes | movement |
| C | Nature/organic, blurred photography | nutrition, sleep |

## API Key

Get your free Ideogram API key at <https://ideogram.ai/manage-api>.
Free tier: 25 generations/month. Paid: $7/mo for 400.
