# RouteHours

An installable browser app for Omar's bus-support work in Denmark. The core task is recording real shift time on a phone, reviewing one weekly timesheet and sending the reviewed Excel attachment with Gmail.

## Product commitments

- Start/finish timer uses persisted timestamps; typed and dictated notes remain reviewable.
- Today and Week are the primary views. Settings separates Profile, Connections and Backups.
- One physical spreadsheet row per work day, with multiple work periods beside each other. Copenhagen is the default saved work timezone.
- Shift notes and AI summaries are optional in payroll exports and default off.
- Gmail sends only after an explicit review and Send. Original files and confirmed send records are retained.
- Google client ID, provider keys and verified account identities are saved on the device. Service access expires and may need user renewal.
- Daily Drive backups are dated snapshots while the app is visible, online and authorized. A closed browser cannot guarantee a scheduled upload. Local backup/validated restore remain available.

## Design brief

The user explicitly requests a complete Apple-inspired redesign, soft gradients, blur behind all interactive elements, frosted glass surfaces, smooth animations, improved dark mode, a matching status bar, launch screen and icon. This is a task app: readable hours, reachable controls and simple navigation govern visual decisions. Use the browser's native form and accessibility behavior.

## Platform and validation

Next.js installable PWA deployed at https://route-hours.vercel.app/. Data is local to the browser installation; external AI, OAuth, Drive, Sheets and Gmail require the relevant network permissions. Automated provider tests use simulated responses. Native phone icon/status-bar rendition, actual microphone and the user's Google permissions require physical-device checks.
