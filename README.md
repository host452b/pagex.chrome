# Pagex

Pagex is a Chrome Manifest V3 extension that extracts the current page into AI-friendly JSON. It is designed to capture structure, text, style summaries, hidden content, and expanded disclosure content with a visible parse flow in the popup.

## Features

- choose the target tab from the popup
- click `Parse` to run an aggressive but guarded collection pass
- expand common disclosure patterns such as `details`, `aria-expanded="false"`, and common accordion controls
- trigger lazy-loaded content by auto-scrolling the page
- collect DOM and shadow DOM nodes into structured JSON
- merge accessible iframe results and mark skipped frames explicitly
- show completion feedback in the popup and copy the final JSON with one click
- request site access for the selected origin at parse time instead of holding permanent all-site access

## File Layout

- `manifest.json`: MV3 extension manifest
- `background.js`: parse orchestration and session state storage
- `content.js`: in-page collector injected into the target tab
- `popup.html`, `popup.css`, `popup.js`: popup UI, animation, and clipboard flow
- `src/shared/`: shared parse state and formatting utilities
- `fixtures/`: manual verification pages
- `tests/`: Node-based unit tests for collector and shared modules

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.

## Use

1. Open the page you want to parse.
2. Click the `Pagex` extension icon.
3. Choose the target tab in the dropdown.
4. Click `Parse`.
5. Approve the site access prompt if Chrome asks for it.
6. Wait until the popup shows the success state.
7. Click `Copy JSON` to copy the structured payload.

## Local Fixture

You can manually verify the collector with `fixtures/demo-page.html`.

1. Open `fixtures/demo-page.html` in Chrome.
2. If Chrome blocks extension access on local files, enable `Allow access to file URLs` for the extension.
3. Run `Parse` and check that the output includes:
   - details content
   - `Read more` expanded content
   - fragment collapse link content
   - shadow DOM content
   - iframe content
   - lazy-loaded content after auto-scroll
   - the danger button remaining unclicked
   - the already expanded control remaining unclicked

## Test

```bash
npm test
```

## Notes

- Chrome internal pages such as `chrome://` cannot be scripted.
- The extension requests origin access on demand, only when you parse a selected site.
- Some cross-origin iframes may still be reported as skipped because Chrome can restrict frame injection even when the page itself is scriptable.
- The collector stores style summaries, not full stylesheet source, to keep the JSON usable for AI workflows.
