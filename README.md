# RouteHours

A personal web app for tracking bus shifts. Start the timer when you board, stop it when you leave, record short notes by typing or speaking, and export exact minutes and decimal hours.

## What works

- Start/stop timer based on saved timestamps, so reloading the page does not reset a running shift.
- Voice commands: “start shift”, “stop shift”, “add note …”, and “log 2 hours”. Timer commands need confirmation. A spoken duration opens a manual entry for review because it does not establish when the work happened. With a Groq key, the microphone records short clips and uses Whisper transcription; without one, it uses browser speech recognition where available.
- Add, edit, and delete shifts. Weekly and monthly totals use the shift's start date.
- Automatic sectioned Gemini summary when AI is connected. Settings lets you enter and test your own Gemini API key; a failed summary does not lose the shift and can be retried.
- Create an actual Google Sheet in your Drive, or download an hours CSV for Google Sheets. A separate detailed CSV includes notes and summaries.
- JSON backup and restore. Data and unfinished note drafts are stored in this browser's local storage, with no account or cross-device sync.

## Run locally

Requires Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. On Windows PowerShell, copy the example with `Copy-Item .env.example .env.local`.

The timer, notes, manual shifts, CSV export, and backups work without API credentials.

## Enable AI summaries

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. In RouteHours **Settings**, paste it into **Gemini API key**, tap **Test & connect Gemini**, then tap **Save settings**. A successful test turns on automatic summaries. No redeploy is needed.

The key is saved in this browser so it works after you reopen the app. It is sent in the body of HTTPS requests to RouteHours' server, which forwards the request to Google. It is not included in RouteHours backup files. Use the app on a private device and remove the key in Settings if needed. For a server-managed setup, you can instead configure `GEMINI_API_KEY` and `APP_ACCESS_TOKEN` in the host's private environment and enter the access code under Advanced settings.

After you stop a shift, the app sends its times and notes to the server's `/api/summarize` route. The server calls Gemini and stores the result in this browser. The microphone records only when you start dictation; it does not record continuously during a shift. Without a Groq key, browser voice input uses the browser's speech recognition service, which may process dictated speech remotely. Only enter de-identified, work-approved notes. Do not include children's names, diagnoses, addresses, or other identifying details. Review AI summaries before sharing them.

## Enable Groq dictation

1. Get an API key from [Groq Console](https://console.groq.com/keys).
2. In RouteHours **Settings**, paste it under **Voice dictation with Groq**, choose automatic language detection or English, Danish, or Arabic, then tap **Test Groq key** and **Save settings**.
3. Tap the microphone to begin a recording. Tap it again to finish. RouteHours sends the short clip through its server to Groq's `whisper-large-v3-turbo` transcription endpoint, then shows the text. Spoken timer commands still need confirmation; spoken notes go into an editable draft. Recording stops automatically after one minute.

Audio is processed transiently and is not stored in RouteHours or included in backups. The API key is saved in this browser, excluded from backups, and sent to RouteHours' server only for key testing and transcription. Groq processes the submitted audio under its own data practices. Use only your own speech and avoid children's identifying details. Groq dictation needs internet access and microphone permission.

## Enable direct Google Sheets creation

1. In Google Cloud, enable the Google Sheets API, configure the OAuth consent screen, and create a **Web application** OAuth client ID. Google's [setup guide](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) explains the steps.
2. Add the app origin shown in RouteHours Settings under **Authorized JavaScript origins**. For local use, add both `http://localhost` and `http://localhost:3000` as required by Google's guide. Add your Google account as a test user if the OAuth app is still in testing.
3. In RouteHours **Settings**, paste the OAuth client ID under **Google Sheets export**, then tap **Save settings**. A confirmation appears when it is saved in this browser. This is a public ID, not the client secret. No redeploy is needed. You can still use `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the host as a fallback.
4. In Export, choose **Create Google Sheet** and grant the requested `drive.file` access. The app creates one new spreadsheet with dates, start/end times, exact minutes, decimal hours, and a total row. Notes stay out of the direct Sheets export.

Google may require additional OAuth verification for use beyond your own test account. If you have not configured OAuth, use **Download hours CSV** and import the file into Google Sheets.

## Deploy

Deploy this Next.js app to a host that runs server routes (for example, Vercel). The in-app Gemini key and OAuth client ID fields work without host environment variables. Register the deployed URL as an OAuth authorized JavaScript origin. If using the optional server-managed AI setup, keep `GEMINI_API_KEY` and `APP_ACCESS_TOKEN` secret; requests on that path require the matching access code.

## Install on your phone

RouteHours is a Progressive Web App. It needs a deployed **HTTPS** website before you can install it from your phone browser. The GitHub code page is not the app URL.

- **Android:** Open the deployed RouteHours URL in Chrome. Tap the three-dot menu, then **Install app** or **Install and create shortcut**, then confirm. You can also use the app's **Install** button when Chrome offers a prompt.
- **iPhone:** Open the deployed RouteHours URL in Safari. Tap **Share → Add to Home Screen**, turn on **Open as Web App**, and tap **Add**.

Launch the installed icon once while online so its app shell can be saved for later offline use. The timer, typed notes, and CSV/backup exports use local browser data; Gemini summaries, Groq dictation, Google sign-in, and direct Google Sheet creation require internet access. Keep using the installed icon for your shifts and export backups regularly. Data is not synced between phones, browsers, or the original Safari/Chrome tab.

## Data and limits

- Browser data can disappear if site storage is cleared or you switch device/browser. Use **Export → Backup data** regularly.
- Browser speech recognition availability and accuracy depend on the browser and its speech service. Groq dictation additionally needs internet access and a valid key. Typing always remains available.
- No employer integration or payroll rule is assumed. Hours are elapsed time rounded to the nearest minute; verify against your employer's timekeeping rules.
- A Google Sheet is created on demand, not kept automatically in sync with later edits. Create a fresh sheet after changing your records.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
```
