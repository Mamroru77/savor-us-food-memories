# Savor

A responsive React recreation of the supplied five-screen food-memory concept.

## Experience

- Five independently navigable phones on desktop, a scrollable gallery on tablets, and one fully navigable phone on mobile.
- Shared local state for memories, favorite places, likes, profile, dietary preferences, theme, and the shared-space anniversary.
- Memory creation with four-photo uploads, image resizing, date validation, ratings, custom tags, and a session-persisted draft.
- A draggable Leaflet map with photo markers, restaurant/city/tag search, saved/shared filters, and a local SVG fallback.
- Memory detail sheets, deletion confirmation, JSON backup/import with validation and deduplication, and local feedback notes.
- SVG icons only. No icon fonts, emoji, or Unicode button glyphs.
- Staggered entrance, screen transitions, and spring-based sheets, with reduced-motion support.

## WeChat Mini Program

A native WeChat Mini Program port lives in `miniprogram/` (open that folder in WeChat DevTools). It mirrors this app's data model, screens, and visual language with a custom tab bar, custom navigation bar, the native `<map>` component, `wx.chooseMedia` photo capture, and JSON backups that are interchangeable with this web version. See `miniprogram/README.md` for the architecture mapping and known limitations.

## Project

- `src/App.tsx`: application entry and responsive gallery.
- `src/components/Phone.tsx`: scaled device frame, navigation, and screen transitions.
- `src/screens/`: the five primary screens.
- `src/components/Sheets.tsx`: detail, settings, and management dialogs.
- `src/store.tsx`: shared state and browser persistence.
- `src/data.ts`: sample content, types, import validation, and image utilities.
- `src/index.css` and `src/styles/`: visual system and responsive styling.

## Data And Services

This is a local-first frontend, not a cloud service. Browser data is stored under `savor-diary-v1`; drafts use `savor-draft-v1` in session storage. Sharing means adding a memory to the Us screen in the current diary, not sending it to another account. Feedback notes are saved locally. Clearing browser storage removes the diary, so export a backup first.

The concept's sample lifetime totals are retained for visual fidelity; newly added or removed memories update the displayed totals. The seven included memory records are editable sample content. New restaurant locations use the selected city's approximate center, while existing places retain their saved coordinates. Distances on the Paris card are measured from a sample Paris starting point, not the visitor's location.

Map tiles use CARTO and OpenStreetMap. Sample stock photography is hosted on Pexels; typography uses Google Fonts. These resources need an internet connection. Uploaded photos and the generated meal/Paris images are local.

## Assets

- `public/images/le-comptoir.jpg` and `public/images/paris-evening.jpg`: custom AI-generated images for this concept.
- Coffee photographs: Soc Nang Dong / Pexels, photos 35393901 and 38575652.
- Japanese meal: Valeria Boltneva / Pexels, photo 20571437.
- Jamie portrait: Oktavianus Mulyadi / Pexels, photo 14368870.
- Alex portrait: Henlynn / Pexels, photo 5715795.
- Icons: Lucide and hand-authored SVG.
- Fonts: DM Sans and Instrument Serif.

## Verification

The production Vite build has been checked. Browser end-to-end tests and pixel-difference comparisons have not been run in this environment.