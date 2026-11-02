# Well: medication cycle board, working copy

A working copy of the cycle board I designed for Well's care home back office.
It is built from the Figma file (Care Homes, section "Cycle tab", node
`7169:129798`). It is not the real product, and all data is fake.

It opens with a short guided tour (7 steps). After the tour, you can use it
freely. Add `?tour=0` to the address to skip the tour.

## What works

- The cycle board: one column per stage, with counts and progress bars.
- Exceptions with a labelling query or clinical query badge.
- Open any order: patient, item, package events, other items in the order.
- Search patients by name or NHS number, and pick them as filters.
- Sort by last update or by prescription date.
- Board or table view, on the same data.
- Previous and Next cycles. Past cycles are read only, with Delivered and Not
  delivered. The next cycle is read only, except the arrival date.
- Change the arrival date of the next cycle in the Cycle dates panel.

## The fake data

Nothing here is a real person.

- NHS numbers start with 999. The NHS keeps this range for test data, so no
  real patient has one. The last digit is a real check digit.
- 86 residents in a 90-bed home, born 1926 to 1956.
- Common care home medicines, with real dose wording, 28-day quantities and
  usual pack sizes.
- Cycles are 28 days and are worked out from today's date, so the board is
  always "live". Add `?today=2026-11-02` to fix the date (the tests do this).
- Staff emails use `@well.example`, a domain that cannot belong to anyone.

## Files

- `site/index.html` - the page
- `site/styles.css` - styles, with colour values from Figma
- `site/data.js` - the fake data
- `site/app.js` - the board, table, dialogs and search
- `site/tour.js` - the guided tour
- `site/icons/` - icons exported from the Figma file
- `tests/app.spec.js` - Playwright tests

## Run it

```bash
npm install
npm start          # http://localhost:4810
npm test
```

## Deploy

Netlify serves `site/` as it is. There is no build step. Every pull request
gets a deploy preview; merging to `main` deploys.
