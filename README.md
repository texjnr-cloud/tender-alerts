# Tender Alerts – Contracts Finder Automation

This project automatically checks the UK **Contracts Finder** API for adaptation-related tenders (DFG, mobility adaptations, accessible housing, wet rooms, etc.) across the West Midlands. It qualifies each tender against a builder's profile and sends daily email alerts for tenders that are a strong or possible match.

## What It Does
- Fetches tenders from Contracts Finder (OCDS API format)
- Searches for keywords such as:
  - disabled adaptations  
  - wet room / level access  
  - bathroom adaptations  
  - DFG / mobility works  
- Checks West Midlands councils individually
- Filters tenders from the last 7 days
- Removes duplicates
- Qualifies each tender using builder criteria:
  - Turnover  
  - SSIP accreditations (CHAS, SMAS, SSIP, Constructionline)  
  - Public liability insurance  
  - Years of adaptations experience  
  - Safeguarding / DBS  
- Scores each tender as **Green**, **Amber**, or **Red**
- Sends email alerts via **Resend**

## Cron Job / Automation
The project can run:
- As a **Vercel Cron Job**, or  
- As a simple **Node.js script** on any server

Example Vercel cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-tender-check",
      "schedule": "0 9 * * *"
    }
  ]
}
