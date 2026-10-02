# Daylight Glass

RouteHours is an **Operate** interface used on a phone between bus journeys. This replaces the earlier neutral/indigo presentation with the user's pinned Apple-inspired glass direction. Expressiveness lives in material, light and motion; tasks and data keep their existing meaning.

## Shared system

- **Background:** static blue daylight blending into pale lavender and mint; dark mode blends navy, violet and teal. It never animates continuously.
- **Foreground:** ink #172339 and secondary #526279; dark #eef3ff and #afbdd2. Soft blue signifies an action or current selection.
- **Primary actions:** blue-to-violet gradient with white type; dark mode uses a light blue/lavender gradient with dark type. Finish shift uses a distinct red label on a frosted control.
- **Materials:** translucent panels and controls. Backdrop blur is 10–14px on fields/buttons, 18–22px on surfaces/scrims, 28px on floating navigation. Dialogs use near-opaque surfaces over a blurred scrim so underlying text does not compete with form content. Foreground text/icons remain sharp.
- **Typography:** native system sans, appropriate to this operating interface. Headings 29–34px/600; body 14–16px, labels 12–14px. Timer numerals use tabular figures with restrained tracking. Native mobile fields remain at least 16px to avoid focus zoom.
- **Spacing/shape:** 4px spacing unit, 18–26px primary padding, 13–16px control corners, 26–28px major surface/sheet corners. Small circular icon controls and a floating two-tab dock follow familiar phone affordances.
- **Elevation:** one low-offset soft shadow on floating surfaces; field outlines define inputs. Do not turn informational rows into extra card grids.

## Surface composition

- **Today:** heading, one dominant timer, inline note/mic while active, last shift, weekly hours, compact backup status, collapsed voice assistant. Start/Finish is the principal action.
- **Week:** a glass week selector, clear total and Review & send, seven chronological day rows with paired intervals. Templates and history expand on demand.
- **Settings:** fixed heading, Profile/Connections/Backups segmented buttons, scrolling content, reachable Save footer. Google setup comes first in Connections; Voice & AI expands when needed.
- **Exports:** a compact daily review with optional notes and further report details. The Gmail step shows the sender and reviewed attachment before Send. Sticky actions share the glass material.
- **Secondary tasks:** voice review, shift editor, cloud restore, setup help and install instructions inherit the same typography, fields, action treatment and sheet geometry.

## Motion and browser surfaces

The sliding dock selection and brief blur-to-sharp view change create continuity. Sheet opening/dismissal uses Motion. Starting a shift softly settles the timer surface; saved-shift checkmarks provide completion feedback. Recording waveforms reflect microphone activity. Controls have short press feedback. Reduced-motion disables entrances, transforms and listening animation. No idle ambient animation.

Selection, caret, focus outlines, scrollbars, placeholder color and numeric data use the palette. Keyboard focus remains visible. Theme-color is #edf3ff in light and #111b31 in dark; browser chrome supports one solid color. Safe-area padding and a default Apple status-bar style integrate the installed app.

## Icon provenance and launch

- Native image-generation tool produced the opaque blue glass clock/route ribbon on pale blue/lavender for this project on 2026-10-02. It contains no text or Apple logo.
- Original generated master is committed privately at `.design-assets/routehours-icon-master.png` (1254 square). It is the reference art, not a mock screenshot.
- Browser Canvas resized/exported `public/icon-192-v3.png` (192), `public/icon-512-v3.png` (512), and `public/apple-icon-v3.png` (180). `public/icon-maskable-v3.png` (512) adds 7.5% padding on each edge over a matching light ground.
- The manifest and metadata use versioned v3 assets. Android native splash uses the manifest's light background and icon; the initial in-app loading view uses the icon, name, short tagline and small spinner.
- Native mask, status bar and installed-icon refresh timing belong to the browser/OS. No actual phone appearance is implied by desktop screenshots.
