# Sign-Up Sheets — Setup Guide

## Overview

The sign-up sheet system has three parts:
1. **The dashboard** (your private admin tool) — where you build sheets, view sign-ups, cancel slots, and import presentations
2. **`signup.html`** (public page on GitHub Pages) — where students sign up, no login required
3. **Google Apps Script** (backend running in a Google Sheet) — stores all data, sends emails, handles reminders

---

## Step 1: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet
2. Name it something like `UF Composition Sign-Up Backend`
3. Copy the spreadsheet URL — you'll need it in Step 2

---

## Step 2: Add the Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete all the default code in the editor
3. Open `apps-script/Code.gs` from this project and copy all its contents
4. Paste it into the Apps Script editor
5. Click **Save** (the floppy disk icon), name the project `SignUpSheets`

---

## Step 3: Configure Script Properties

In the Apps Script editor, go to **Project Settings** (the gear icon) → **Script Properties** → **Add script property** for each of the following:

| Property | Value |
|----------|-------|
| `ADMIN_EMAIL` | Your email address (used as reply-to on all emails) |
| `ADMIN_KEY` | A secret key you choose (e.g. a random string like `uf-comp-2026-admin`) — you'll enter this in the dashboard too |
| `SIGNUP_PAGE_URL` | Your public sign-up page URL: `https://yourusername.github.io/your-repo/signup.html` |
| `REMINDER_DAYS_1` | `7` (or however many days before for the first reminder) |
| `REMINDER_DAYS_2` | `1` (days before for the second reminder) |

---

## Step 4: Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear next to "Select type" → **Web app**
3. Settings:
   - Description: `Sign-Up Sheets v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Copy the **Web app URL** — it looks like `https://script.google.com/macros/s/AKfyc…/exec`

---

## Step 5: Set up the daily reminder trigger

1. In the Apps Script editor, click the **clock icon** (Triggers) in the left sidebar
2. Click **+ Add Trigger**
3. Settings:
   - Function: `sendPendingReminders`
   - Event source: **Time-driven**
   - Type: **Day timer**
   - Time: **7am – 8am** (or whenever you prefer)
4. Click **Save**

This runs every morning and sends any reminder emails due that day.

---

## Step 6: Configure the dashboard

1. In your dashboard, go to **Sign-Up Sheets → Settings tab**
2. Paste your **Apps Script URL** from Step 4
3. Enter your **Admin Key** (must exactly match what you set in Script Properties)
4. Enter your **Public Sign-Up Page URL** (`https://yourusername.github.io/your-repo/signup.html`)
5. Set reminder days if different from defaults
6. Click **Save Settings**

---

## Step 7: Update signup.html with your Apps Script URL

The public sign-up page needs to know your Apps Script URL to load sheet data.

Open `signup.html` and find this line near the top of the `<script>` block:

```javascript
const APPS_SCRIPT_URL = '%%APPS_SCRIPT_URL%%';
```

Replace `%%APPS_SCRIPT_URL%%` with your actual URL:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfyc…/exec';
```

Save and re-upload to GitHub.

---

## How to create a sign-up sheet

1. Go to **Sign-Up Sheets → Builder tab**
2. Enter a title (e.g. "Composition Studio — Fall 2026")
3. Click **+ Add Block** for each group of time slots:
   - **Sub-heading** (optional): appears above the first date in this block, e.g. "DMA Students — 30 min"
   - **Start date**: the first date this block occurs
   - **Start time**: e.g. `2:00 PM`
   - **Slot duration**: length of each presentation slot in minutes
   - **Number of slots**: how many slots per session (e.g. 2 for two 25-minute slots)
   - **Gap**: minutes between slots (0 = back to back)
   - **Recurrence**: Weekly or Every 2 Weeks, with an end date
4. The **Preview** panel shows all generated slots as students will see them
5. Click **🚀 Publish Sheet** to push it to the backend

The sheet is now live. Share the link with students.

---

## Weekly studio class example

- Title: `Composition Studio — Fall 2026`
- Block sub-heading: *(leave blank for a simple weekly sheet)*
- Start date: first studio class date
- Start time: `2:00 PM`
- Duration: `25`
- Slots: `2`
- Gap: `0`
- Recurrence: **Weekly**, until last class date

This generates two 25-minute slots (2:00–2:25 and 2:25–2:50) for every week of the semester.

---

## End-of-semester jury example

Create multiple blocks on the same day:

**Block 1**
- Sub-heading: `Undergraduate — 15 minutes`
- Date: jury date
- Start time: `9:00 AM`
- Duration: `15`, Slots: `8`, Gap: `5`
- Recurrence: none

**Block 2**
- Sub-heading: `MM Students — 20 minutes`
- Date: same jury date
- Start time: `11:30 AM`
- Duration: `20`, Slots: `4`, Gap: `5`
- Recurrence: none

**Block 3**
- Sub-heading: `DMA/PhD Students — 30 minutes`
- Date: same jury date
- Start time: `2:00 PM`
- Duration: `30`, Slots: `4`, Gap: `10`
- Recurrence: none

All three blocks appear on the sign-up page under the same date, each with its own sub-heading.

---

## Cancelling a slot

1. Go to **Sign-Up Sheets → Sheets tab**
2. Click **👁 View Slots** on the relevant sheet
3. Find the student's slot and click **Cancel**
4. The student is automatically notified by email

---

## Importing presentations to the dashboard

After each class or jury:

1. Go to **Sign-Up Sheets → Sheets tab**
2. Click **⬇ Import to Presentations** on the relevant sheet
3. The dashboard reads all claimed slots, fuzzy-matches names to your student roster, and logs them as presentation records
4. Any names that couldn't be matched are flagged in the toast notification — you can edit those records manually

---

## Troubleshooting

**"Could not connect to Apps Script"**
→ Make sure the Web App is deployed with "Anyone" access. Try opening the Apps Script URL directly in a browser — you should see `{"sheets":[]}` or similar JSON.

**Emails not sending**
→ Check that `ADMIN_EMAIL` is set correctly in Script Properties. Gmail may require you to authorize the script on first run — go to Apps Script → Run → `sendConfirmation` manually to trigger the auth prompt.

**"Unauthorized" error when cancelling**
→ The Admin Key in the dashboard Settings tab must exactly match the `ADMIN_KEY` in Script Properties (case-sensitive).

**Name not matching roster on import**
→ The fuzzy matcher allows up to 3 character differences. If a student signed up with a nickname or abbreviation (e.g. "Mike" vs "Michael"), edit the presentation record manually after import.

---

*Setup guide v1 — UF Composition & Theory Area Head Dashboard*
