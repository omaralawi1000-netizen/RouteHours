# RouteHours

A personal web app for tracking bus shifts. Start the timer when you board, stop it when you leave, record short notes by typing or speaking, and export exact minutes and decimal hours.

## What works

- Start/stop timer based on saved timestamps, so reloading the page does not reset a running shift.
- Voice commands: “start shift”, “stop shift”, “add note …”, and “log 2 hours”. Timer commands need confirmation. A spoken duration opens a manual entry for review because it does not establish when the work happened.
- Add, edit, and delete shifts. Weekly and monthly totals use the shift's start date.
- Automatic sectioned Gemini summary when AI is enabled and configured. A failed summary does not lose the shift and can be retried.
- Create an actual Google Sheet in your Drive, or download an hours CSV for Google Sheets. A separate detailed CSV includes notes and summaries.
- JSON backup and restore. Data is stored in this browser's local storage, with no account or cross-device sync.

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
2. Set `GEMINI_API_KEY` and a strong private `APP_ACCESS_TOKEN` in `.env.local` or your host's server environment. Do not use a `NEXT_PUBLIC_` prefix for either secret.
3. Restart or redeploy. In RouteHours Settings, enter the same access code and enable automatic AI summaries.

After you stop a shift, the app sends its times and notes to the server's `/api/summarize` route. The server calls Gemini and stores the result in this browser. The app does not record bus audio. Browser voice input uses the browser's speech recognition service, which may process dictated speech remotely. Only enter de-identified, work-approved notes. Do not include children's names, diagnoses, addresses, or other identifying details. Review AI summaries before sharing them.

## Enable direct Google Sheets creation

1. In Google Cloud, enable the Google Sheets API, configure the OAuth consent screen, and create a **Web application** OAuth client ID. Google's [setup guide](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) explains the steps.
2. Add the app origin under **Authorized JavaScript origins**. For local use, add both `http://localhost` and `http://localhost:3000` as required by Google's guide.
3. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the web client ID and restart or redeploy.
4. In Export, choose **Create Google Sheet** and grant the requested `drive.file` access. The app creates one new spreadsheet with dates, start/end times, exact minutes, decimal hours, and a total row. Notes stay out of the direct Sheets export.

Google may require additional OAuth verification for use beyond your own test account. If you have not configured OAuth, use **Download hours CSV** and import the file into Google Sheets.

## Deploy

Deploy this Next.js app to a host that runs server routes (for example, Vercel). Add the same environment variables in the host's settings, and register the deployed URL as an OAuth authorized JavaScript origin. Keep `GEMINI_API_KEY` and `APP_ACCESS_TOKEN` secret. AI requests are rejected unless both server values are set and the access code matches.

## Data and limits

- Browser data can disappear if site storage is cleared or you switch device/browser. Use **Export → Backup data** regularly.
- Voice recognition availability and accuracy depend on the browser, microphone permission, and its speech service. Typing always remains available.
- No employer integration or payroll rule is assumed. Hours are elapsed time rounded to the nearest minute; verify against your employer's timekeeping rules.
- A Google Sheet is created on demand, not kept automatically in sync with later edits. Create a fresh sheet after changing your records.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
```
