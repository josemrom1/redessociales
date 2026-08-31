# Publishing Handoff — Wellness Image Agent

This document describes how approved images move from `output/approved/` to live social media channels.

---

## File Naming Convention

```
YYYYMMDD_HHMMSS_<category>_<lang>_<quote_snippet>.png
```

Example:
```
20260901_143000_mindfulness_en_breathe_this_moment_is.png
20260901_143000_mindfulness_es_respira_este_momento_es.png
```

Always publish the **EN and ES pair together** or on consecutive days at the same time.

---

## Channels & Format Guidance

| Platform | Format | Ratio | Notes |
|----------|--------|-------|-------|
| Instagram Stories | Image | 9:16 | Upload directly; add link sticker if needed |
| Instagram Feed | Image | 9:16 or square crop | Crop to 1:1 if preferred |
| TikTok | Photo slide | 9:16 | Use TikTok photo mode |
| Facebook Stories | Image | 9:16 | Schedule via Meta Business Suite |
| LinkedIn | Image post | 9:16 | Works well for professional wellness content |
| Pinterest | Pin | 9:16 | Add destination URL to pin |

---

## Option A — Buffer (Recommended)

1. **Log into Buffer** and select the organization.
2. Go to **Create Post** → select all target channels.
3. Upload the approved EN image first.
4. Add caption text (copy from `wellness_bank.json` → `hashtags_en`):
   ```
   <quote text>
   
   #mindfulness #wellness ...
   ```
5. Set post type (Story / Post) and schedule to the next open slot or a custom time.
6. Repeat for the ES image on the same channels or dedicated Spanish-language channels.
7. Move the files from `output/approved/` to an archive folder (e.g., `output/published/`).

---

## Option B — Manual Posting

1. Copy images from `output/approved/` to your phone via cloud storage (iCloud, Google Drive, or OneDrive).
2. Open the platform app and create a new Story / post.
3. Select the image and add caption + hashtags from `wellness_bank.json`.
4. Post or schedule using the platform's built-in scheduler.

---

## Caption Template

```
<quote in target language>

<hashtags from wellness_bank.json>
```

Example (English, mindfulness):
```
Breathe. This moment is enough.

#mindfulness #breathe #presentmoment #wellness #selfcare
```

---

## Alt-Text Template

For accessibility, add alt-text when the platform supports it:

```
Quote card: "<quote text>" — wellness tip on a <color> background.
```

Example:
```
Quote card: "Breathe. This moment is enough." — mindfulness tip on a soft lavender background.
```

---

## Scheduling Cadence (Suggested)

| Day | Content |
|-----|---------|
| Monday | Movement or Nutrition quote |
| Wednesday | Mindfulness or Mental Health quote |
| Friday | Sleep or any category |
| (Optional) Saturday | Spanish version of the week's top quote |

Adjust based on audience analytics. Aim for **3–5 posts per week** per channel.

---

## Archive & Audit

After publishing:
1. Move the image pair to `output/published/YYYY-MM/`.
2. Log the post in a simple CSV or Notion table:
   ```
   date, quote_id, lang, platform, url, engagement_score
   ```
3. Review engagement monthly to identify top-performing categories and adjust the generation cadence.
