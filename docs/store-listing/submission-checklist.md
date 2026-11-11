# Pagex Chrome Web Store Submission Checklist

## 1. Runtime package / 运行时包

- [ ] Run `npm run generate:store-assets`
- [ ] Run `npm run package`
- [ ] Confirm upload archive exists:
  - `release/pagex-v0.4.1.zip`
- [ ] Confirm runtime icons exist:
  - `assets/icons/pagex-16.png`
  - `assets/icons/pagex-32.png`
  - `assets/icons/pagex-48.png`
  - `assets/icons/pagex-128.png`
- [ ] Verify zip size < 10MB
- [ ] Unzip to temp dir and confirm `manifest.json` at root
- [ ] Verify no `.ts`, `.map`, `.env`, `node_modules`, `.git` in zip

## 2. Store images / 商店图片

- [ ] Upload small promo image:
  - `store-assets/promo/pagex-small-promo-440x280.png`
  - required size: `440x280`
- [ ] Upload marquee image if desired:
  - `store-assets/promo/pagex-marquee-1400x560.png`
  - recommended size: `1400x560`
- [ ] Upload at least 1 screenshot, preferably all 4:
  - `store-assets/screenshots/pagex-screenshot-01-target-tab-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-02-parsing-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-03-parse-complete-1280x800.png`
  - `store-assets/screenshots/pagex-screenshot-04-copy-json-1280x800.png`
  - target size: `1280x800`
- [ ] Consider adding screenshots for new features:
  - Screenshot Full Page button
  - Get cookies.txt button
  - Stop button with countdown

## 3. Listing copy / 商店文案

- [ ] Use English primary copy from:
  - `docs/store-listing/listing-en.md`
- [ ] Use Chinese reference copy from:
  - `docs/store-listing/listing-zh-CN.md`
- [ ] Confirm summary is within Chrome Web Store limits
- [ ] Confirm title stays concise: `Pagex`
- [ ] Avoid keyword stuffing, exaggerated claims, fake ranking claims, or misleading comparisons

## 4. Privacy and support / 隐私与支持

- [ ] Publish an accessible privacy policy page based on:
  - `docs/store-listing/privacy-policy-en.md`
  - `docs/store-listing/privacy-policy-zh-CN.md`
- [ ] Replace all placeholders:
  - support URL if it changes
  - website if it changes
  - privacy policy URL if hosted outside GitHub
- [ ] Make sure Chrome Web Store privacy fields match the published policy and actual extension behavior
- [ ] Confirm privacy policy covers cookies access and screenshot capture

## 5. Metadata and dashboard / 元数据与后台配置

- [ ] Confirm category selection
- [ ] Add support URL
- [ ] Add homepage URL if available
- [ ] Add privacy policy URL
- [ ] Review permissions shown in listing:
  - `activeTab`
  - `cookies`
  - `scripting`
  - `storage`
  - `tabs`
  - `webNavigation`
  - optional site access, requested once on first use (revocable in Settings)
- [ ] Fill permission justifications:

**activeTab:**
"This extension reads the current page content to extract structured data, capture screenshots, and export cookies. It only activates when the user clicks the extension icon. No data is collected or transmitted — all processing happens locally."

**cookies:**
"Reads cookies for the selected tab when the user clicks 'Get cookies.txt'. Cookie data is exported locally as a text file and never sent to any server."

**scripting:**
"Injects a content script into the selected tab to collect page structure, scroll for screenshots, and read localStorage/sessionStorage. Only activates on user action."

**storage:**
"Stores batch status and the compressed results of the latest batch in chrome.storage.session (cleared when the browser closes), plus two settings in chrome.storage.local. No data is synced to external servers."

**tabs:**
"Reads tab titles and URLs to populate the tab picker in the popup. This information is only used locally and never transmitted."

**webNavigation:**
"Inspects frame coverage for the current tab to identify accessible and cross-origin frames during extraction."

## 6. Security self-check / 安全自检

- [ ] No `eval()` or `new Function()` in production code
- [ ] No `innerHTML` with user input in production code
- [ ] No remote `<script src="https://...">` loading
- [ ] CSP does not contain `unsafe-eval`
- [ ] No hardcoded API keys, secrets, or tokens
- [ ] No `fetch()` or `XMLHttpRequest` — extension never phones home
- [ ] Permissions are minimal and each is justified above

## 7. Compliance self-check / 合规自检

- [ ] Screenshots reflect real product behavior
- [ ] Promo images use brand styling, not fake Chrome system warnings
- [ ] Listing text is accurate, current, and complete
- [ ] Description does not contain anonymous testimonials
- [ ] Description does not repeat keywords unnaturally
- [ ] Privacy claims match actual code behavior
- [ ] The extension does not claim remote AI processing unless that feature truly exists

## 8. Final verification / 最终验证

- [ ] Load unpacked extension locally
- [ ] Extract a real page successfully
- [ ] Confirm Stop button works during extraction
- [ ] Confirm Download JSON works
- [ ] Confirm Screenshot Full Page works
- [ ] Confirm Get cookies.txt works
- [ ] Confirm permission request flow works
- [ ] Confirm the packaged zip installs correctly before submitting
