# Crypto_Trace

Crypto_Trace is a personal cryptocurrency investment expense tracker designed to calculate and monitor cumulative spending over time. It allows users to log purchases and track total invested capital across months and years. This tool focuses exclusively on tracking invested amounts, with performance and market valuation handled externally.

---

## 📌 Purpose

Crypto_Trace was built to answer a simple question:

**How much capital have I actually invested in crypto over time?**

It does not track live prices, portfolio valuation, or market performance.  
Instead, it focuses purely on recording and calculating total invested capital, fees included.

Market comparison and performance analysis can be done separately using platforms like CoinMarketCap or exchange dashboards.

---

## 🚀 Features

- Add cryptocurrency purchases with:
  - Date
  - Asset name
  - Amount invested
  - Fee paid
  - Quantity received
- Automatic unit price calculation (investment + fee included)
- Yearly tabs (2025, 2026, ...) with per-year totals, plus an "All" view
- Year-over-year spend comparison (vs. same date range the previous year)
- Per-asset breakdown (horizontal scrollable "dock" with share of spend per coin)
- Monthly/yearly spend chart, average monthly spend, average cost per purchase and purchase frequency
- Search by asset and filter by date range
- Sortable table columns
- Duplicate-purchase warning (same date + asset)
- Delete with a 5-second undo
- Automatic rolling backups (last 5 states) recoverable from the UI, plus a reminder banner if you haven't exported in a while
- Export/import as JSON, export as CSV
- EUR ⇄ USD currency toggle (live rate via a keyless public API)
- Installable as a PWA (offline-capable app shell via a service worker)
- Dark mode support
- Responsive design (mobile-friendly, portrait and landscape)

---

## 🛠 Tech Stack

- HTML5
- CSS3 (Custom Properties / Dark Mode)
- Vanilla JavaScript
- LocalStorage (no backend required)
- Service Worker + Web App Manifest (installable, offline app shell)

---

## 💾 Data Storage

All data is stored locally in the browser using `localStorage`, including a rolling history of the last 5 states for quick recovery.

This means:
- No external database
- No server
- No data tracking
- Full privacy

If browser storage is cleared, the data will be lost — export a JSON/CSV backup periodically (the app reminds you if it's been a while).

---

## 📈 Project Philosophy

Crypto_Trace is intentionally simple.

It separates:
- **Investment tracking (this tool)**  
from  
- **Market valuation (external platforms)**

This keeps the tool lightweight, private, and focused.

---

## 🔮 Possible Future Improvements

- Inline row editing (edit a purchase directly in the table, without jumping to the form)
- Portfolio category grouping (e.g. L1s, stablecoins, memecoins)
- Keyboard-driven quick add

---
