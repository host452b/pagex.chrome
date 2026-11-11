# Pagex Chrome Web Store Listing (EN)

## Store identity

- Title: `Pagex`
- Suggested category: `Productivity`
- Suggested language: `English (primary)`

## Short summary

Extract page content into AI-ready JSON, capture full-page screenshots, and export cookies — all offline.

## Full description

Pagex is a Chrome extension that extracts page content into structured JSON, captures full-page screenshots, and exports cookies — all locally, without sending data anywhere.

It helps you collect visible content, hidden content, expandable sections, frame results, and lightweight style context without copying raw HTML by hand. The extension is built for people who need to move web content into AI, automation, or internal analysis workflows with a cleaner and more controlled payload.

### What Pagex does

**Page extraction**
- Tick one or many tabs in the popup and extract them in one batch
- Expand common disclosure patterns such as `details`, `aria-expanded="false"`, and fragment-based collapse controls
- Trigger lazy-loaded content by scrolling before extraction
- Collect DOM and shadow DOM nodes into structured JSON
- Merge accessible frame results and label skipped or failed frames clearly
- Filter sensitive attributes and remove query strings and hashes from exported values
- Download one page as a JSON file, or a whole batch as a single ZIP (one JSON per page)
- Optional auto-download as soon as extraction finishes
- Stop a running extraction and retry at any time
- Live per-page progress, plain-language reasons for pages that can't be read, and a first-run quick start
- English and Simplified Chinese interface, light and dark themes

**Full-page screenshot**
- Capture the entire scrollable page as a stitched PNG
- Automatically handle SPA pages with non-document scrolling containers
- Hide scrollbars and neutralize fixed/sticky elements for clean output
- Wait for lazy-loaded images before each capture
- Scale down automatically for very long pages (Chrome canvas limits)
- No extra permissions needed — uses existing activeTab + scripting

**Cookie and storage export**
- Export all cookies for the selected tab in Netscape cookies.txt format (curl/wget compatible)
- Include localStorage and sessionStorage data in the export
- Works with any site you have permission to access
- Output header clearly states data never leaves your device

### Why it is useful

- Cleaner input for AI than copying raw page source
- Full-page screenshots that work on complex SPA and ad-heavy pages
- Cookie export for debugging, testing, and automation workflows
- Everything runs locally — no data is ever sent to a server

### Output highlights

The exported JSON payload can include:

- Page title and URL
- Frame metadata
- Element tags and filtered attributes
- Visibility and bounding box data
- Direct text and compact text fields
- Style summaries
- Warnings for skipped frames, truncation, or budget limits

## Permission explanation

- `activeTab`: lets Pagex work with the selected page
- `scripting`: injects the collector into the selected tab
- `cookies`: reads cookies for the selected tab when you click "Get cookies.txt"
- `storage`: keeps batch status and compressed results in session storage (cleared when the browser closes) and saves your settings
- `tabs`: reads the selected tab information in the popup
- `webNavigation`: checks frame coverage for the current tab
- optional host access: requested only when you interact with a selected site origin

## Suggested screenshots

Use these store screenshots:

1. `store-assets/screenshots/pagex-screenshot-01-target-tab-1280x800.png`
2. `store-assets/screenshots/pagex-screenshot-02-parsing-1280x800.png`
3. `store-assets/screenshots/pagex-screenshot-03-parse-complete-1280x800.png`
4. `store-assets/screenshots/pagex-screenshot-04-copy-json-1280x800.png`

## Suggested promo assets

- Small promo: `store-assets/promo/pagex-small-promo-440x280.png`
- Marquee: `store-assets/promo/pagex-marquee-1400x560.png`

## Support information

- Support page: `https://github.com/host452b/pagex/issues`
- Website: `https://github.com/host452b/pagex`
- Privacy policy URL: `https://github.com/host452b/pagex/blob/main/docs/store-listing/privacy-policy-en.md`
