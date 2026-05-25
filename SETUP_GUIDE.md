# Area Head Dashboard — Setup Guide

## What you'll have when done
- Dashboard hosted at `https://YOUR-USERNAME.github.io/area-head-dashboard/`
- Data auto-saved to a file in your Google Drive
- Events, reminders, meetings, and recurring tasks automatically added to your Google Calendar
- Syncs to your phone and Mac Calendar through Google

---

## Step 1: Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in (create a free account if needed)
2. Click **New repository** (the green button or the `+` menu)
3. Name it: `area-head-dashboard`
4. Set it to **Public** *(required for free GitHub Pages)*
5. Click **Create repository**

---

## Step 2: Upload the dashboard files

You should have this file structure from the download:
```
area-head-dashboard/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── config.js
    ├── google.js
    ├── store.js
    ├── calendar.js
    └── app.js
```

### Option A — GitHub Desktop (easiest, no command line)
1. Download and install [GitHub Desktop](https://desktop.github.com)
2. Clone your new repository to your Mac
3. Copy all the dashboard files into the cloned folder
4. In GitHub Desktop, click **Commit to main**, then **Push origin**

### Option B — Drag and drop on GitHub.com
1. Go to your repository on github.com
2. Click **uploading an existing file**
3. Drag in `index.html` and click **Commit changes**
4. Create the `css/` folder: click **Create new file**, type `css/style.css`, paste the contents
5. Repeat for each file in `js/`

---

## Step 3: Enable GitHub Pages

1. In your repository, go to **Settings** → **Pages** (left sidebar)
2. Under "Source", select **Deploy from a branch**
3. Choose branch: **main**, folder: **/ (root)**
4. Click **Save**
5. Wait ~2 minutes. Your site will be at:
   `https://YOUR-USERNAME.github.io/area-head-dashboard/`

---

## Step 4: Set up Google Cloud Project

This is the one-time technical step. It takes about 10-15 minutes.

### 4a. Create a project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with the Google account you want to use
3. Click the project dropdown at the top → **New Project**
4. Name it: `UF Area Head Dashboard`
5. Click **Create**

### 4b. Enable the APIs
1. In the left menu, go to **APIs & Services** → **Library**
2. Search for **Google Drive API** → click it → click **Enable**
3. Go back to Library, search for **Google Calendar API** → click it → click **Enable**

### 4c. Configure the OAuth consent screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in:
   - App name: `UF Area Head Dashboard`
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue** through all steps (you can skip optional fields)
5. On the **Test users** page, click **+ Add users** and add your own Google email address
6. Click **Save and Continue**, then **Back to Dashboard**

### 4d. Create OAuth credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Area Head Dashboard`
5. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   ```
   https://YOUR-USERNAME.github.io
   ```
   *(Replace YOUR-USERNAME with your actual GitHub username)*
6. Click **Create**
7. A dialog appears with your **Client ID** — it looks like:
   ```
   123456789-abcdefghijklmnop.apps.googleusercontent.com
   ```
   **Copy this — you'll need it in the next step.**

---

## Step 5: Add your Client ID to the dashboard

1. Open `js/config.js` in a text editor
2. Find this line:
   ```javascript
   GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',
   ```
3. Replace `YOUR_GOOGLE_CLIENT_ID_HERE` with your actual Client ID:
   ```javascript
   GOOGLE_CLIENT_ID: '123456789-abcdefghijklmnop.apps.googleusercontent.com',
   ```
4. Save the file and re-upload it to GitHub (or commit and push if using GitHub Desktop)

---

## Step 6: First sign-in

1. Go to your GitHub Pages URL
2. Click **Sign in with Google**
3. Choose your Google account
4. You'll see a warning: **"Google hasn't verified this app"** — this is normal for personal apps
5. Click **Advanced** → **Go to UF Area Head Dashboard (unsafe)**
6. Grant the requested permissions (Drive and Calendar access)

You'll only ever see this warning once. After that, sign-in is instant.

---

## Step 7: (Optional) Configure Calendar settings

In `js/config.js` you can also change:

```javascript
// Use 'primary' for your main calendar, or paste a specific calendar ID
// from Google Calendar Settings → Calendars → click a calendar → Calendar ID
CALENDAR_ID: 'primary',

// Color for events added by this dashboard
// 9 = Blueberry (dark blue) — matches the dashboard navy theme
CALENDAR_COLOR_ID: '9',
```

To use a **separate calendar** (recommended to keep things organized):
1. In Google Calendar, click **+ Other calendars** → **Create new calendar**
2. Name it `UF Area Head`
3. Go to its settings and copy the **Calendar ID**
4. Paste it into `config.js` as the `CALENDAR_ID`

---

## How it works after setup

| Action | What happens automatically |
|--------|---------------------------|
| Add a calendar event | Created in Google Calendar with popup reminder |
| Add a reminder | Created as all-day Google Calendar event, color-coded by urgency |
| Schedule a faculty meeting | Meeting + agenda-solicitation reminder both added to Google Calendar |
| Add a recurring task with a due date | Added to Google Calendar |
| Any data change | Auto-saved to `uf_area_head_data.json` in your Google Drive |
| Open dashboard on a new device | Data loads from Drive automatically after signing in |

---

## Accessing on your phone / other devices

Once synced to Google Calendar, all events appear automatically on:
- iPhone Calendar app (if Google account is added)
- macOS Calendar app (if Google account is added)
- Google Calendar app on any device

To add your Google account to iPhone Calendar:
**Settings → Calendar → Accounts → Add Account → Google**

---

## Troubleshooting

**"This app isn't verified" warning keeps appearing**
→ Normal for personal apps. Click Advanced → Go to app. Happens only once per browser.

**Events not appearing in Google Calendar**
→ Check that the correct `CALENDAR_ID` is set in `config.js`. Try `'primary'` first.

**"Sign in" button is greyed out**
→ Your `GOOGLE_CLIENT_ID` in `config.js` hasn't been set or the file hasn't been re-uploaded to GitHub.

**Data not loading**
→ Check that your GitHub Pages URL exactly matches the Authorized JavaScript Origin you entered in Step 4d. It must match including `https://`.

**Drive file location**
→ Your data is saved as `uf_area_head_data.json` in the root of your Google Drive. Do not delete or rename it.

---

## Backing up your data

Your data lives in `uf_area_head_data.json` in Google Drive. You can:
- Download it anytime as a backup
- Open it in a text editor to inspect
- If something goes wrong, upload a backup copy to restore

---

*Dashboard version 2.0 — built for UF Composition & Theory Area Head*
