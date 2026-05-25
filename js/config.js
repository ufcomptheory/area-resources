// ═══════════════════════════════════════════════════════
// CONFIGURATION — fill these in after Google Cloud setup
// See SETUP_GUIDE.md for step-by-step instructions
// ═══════════════════════════════════════════════════════

const CONFIG = {
  // Your Google OAuth 2.0 Client ID
  // Get this from: https://console.cloud.google.com/
  // → APIs & Services → Credentials → Create OAuth 2.0 Client ID
  GOOGLE_CLIENT_ID: '831478288151-hn4r257sbg1hnl7ieicblo4q6lk4u9t6.apps.googleusercontent.com',

  // The name of the JSON file that stores your dashboard data in Google Drive
  DRIVE_FILE_NAME: 'uf_area_head_data.json',

  // Google Calendar ID to sync events to.
  // 'primary' = your main Google Calendar.
  // Or paste a specific calendar ID from Google Calendar settings.
  CALENDAR_ID: 'c_eec443cd6eab2b074a041d0e20392e7fd663a8414ebe85cff668075dbd62acf2@group.calendar.google.com',

  // Color tag for events added by this dashboard in Google Calendar
  // Options: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
  //          6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato
  CALENDAR_COLOR_ID: '9', // Blueberry (dark blue)
};
