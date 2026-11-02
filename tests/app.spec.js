import { test, expect } from '@playwright/test';

/* A fixed "today" keeps the data the same on every run. */
const PAGE = '/?today=2026-11-02&tour=0';
const TOUR = '/?today=2026-11-02';

test.describe('fake data', () => {
  test('NHS numbers are in the 999 test range and pass the check digit', async ({ page }) => {
    await page.goto(PAGE);
    const bad = await page.evaluate(() => WellData.makeResidents().filter(p => {
      const d = p.nhs.replace(/\s/g, '');
      if (!/^999\d{7}$/.test(d)) return true;
      const sum = [...d.slice(0, 9)].reduce((s, v, i) => s + +v * (10 - i), 0);
      const check = (11 - (sum % 11)) % 11;
      return check !== +d[9];
    }).map(p => p.nhs));
    expect(bad).toEqual([]);
  });

  test('residents are care home age and nothing happens after today', async ({ page }) => {
    await page.goto(PAGE);
    const r = await page.evaluate(() => {
      const ps = WellData.makeResidents();
      const end = new Date(2026, 10, 2, 23, 59);
      const cycles = [-2, -1, 0, 1].map(k => WellData.buildCycle(App.current + k, App.today, ps));
      return {
        years: ps.map(p => p.dob.getFullYear()),
        future: cycles.flatMap(c => c.items).filter(i => i.events.some(e => e.at > end)).length,
        rxFuture: cycles.flatMap(c => c.items).filter(i => i.rx > end).length,
      };
    });
    expect(Math.min(...r.years)).toBeGreaterThanOrEqual(1926);
    expect(Math.max(...r.years)).toBeLessThanOrEqual(1956);
    expect(r.future).toBe(0);
    expect(r.rxFuture).toBe(0);
  });
});

test.describe('cycle board', () => {
  test('the active cycle shows every stage and the counts add up', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('.col')).toHaveCount(7);
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Active');
    const counts = await page.locator('.col-title span:last-child').allInnerTexts();
    const total = await page.evaluate(() => WellData.buildCycle(App.current, App.today, WellData.makeResidents()).items.length);
    expect(counts.reduce((s, n) => s + +n, 0)).toBe(total);
  });

  test('search by name picks a patient and filters the board', async ({ page }) => {
    await page.goto(PAGE);
    const name = await page.locator('.ocard-who').first().innerText();
    await page.locator('[data-search]').fill(name.split(' ')[1]);
    await page.locator(`[data-suggest] [role="option"]:has-text("${name}")`).click();
    await expect(page.locator('.chip')).toContainText(name);
    const who = await page.locator('.ocard-who').allInnerTexts();
    expect(new Set(who)).toEqual(new Set([name]));
    await page.locator('[data-unpick]').click();
    await expect(page.locator('.chip')).toHaveCount(0);
  });

  test('search by NHS number works', async ({ page }) => {
    await page.goto(PAGE);
    const nhs = await page.locator('.ocard .row:nth-child(2) dd').first().innerText();
    await page.locator('[data-search]').fill(nhs.replace(/\s/g, ''));
    await expect(page.locator('[data-suggest] [role="option"]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('.chip')).toHaveCount(1);
  });

  test('sorting by prescription date orders the cards', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[data-sort-btn]').click();
    await page.getByRole('menuitemradio', { name: 'Prescription received (oldest to newest)' }).click();
    await expect(page.locator('[data-sort-btn]')).toContainText('Sort by:');
    const dates = await page.locator('[data-col="flowrx"] .ocard .row:nth-child(3) dd').allInnerTexts();
    const t = dates.map(d => { const [dd, mm, yy] = d.split('/'); return +new Date(+yy, mm - 1, +dd); });
    expect(t).toEqual([...t].sort((a, b) => a - b));
  });

  test('a card opens the order, Escape closes it and focus goes back', async ({ page }) => {
    await page.goto(PAGE);
    const card = page.locator('[data-col="ready"] .ocard').first();
    const med = await card.locator('strong').innerText();
    await card.click();
    const dialog = page.locator('[data-order]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.item h3').first()).toHaveText(med);
    await expect(dialog.locator('.events tbody tr')).toHaveCount(2);
    await dialog.locator('[data-acc]').click();
    await expect(dialog.locator('#acc-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card).toBeFocused();
  });

  test('the table shows the same orders and a row opens the order', async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole('radio', { name: 'Table' }).click();
    await expect(page.locator('[data-table] tbody tr')).toHaveCount(60);
    await page.locator('[data-table] tbody tr').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-order]')).toBeVisible();
  });

  test('a past cycle is read only with two columns', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[data-prev]').click();
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Completed');
    await expect(page.locator('.col')).toHaveCount(2);
    await expect(page.locator('[data-banner]')).toContainText('is closed and cannot be edited');
    await expect(page.locator('[data-edit-arrival]')).toBeHidden();
    await page.locator('[data-back-current]').click();
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Active');
  });

  test('the next cycle can move its arrival date, and only that', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[data-next]').click();
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Upcoming');
    await expect(page.locator('[data-next]')).toBeDisabled();
    const before = await page.locator('[data-cycle-range]').innerText();
    await page.locator('[data-edit-arrival]').click();
    const sheet = page.locator('[data-dates]');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.cal .start')).toHaveCount(1);
    await expect(sheet.locator('.cal .dispatch')).toHaveCount(1);
    const next = sheet.locator('.cal .arrival + button:not(:disabled)');
    await next.click();
    await sheet.locator('[data-dates-confirm]').click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-toast]')).toContainText('Arrival date');
    await expect(page.locator('[data-cycle-range]')).not.toHaveText(before);
  });

  test('the cycle menu jumps to any cycle', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[data-cycle-menu]').click();
    await page.locator('[data-cycle-list] [role="menuitemradio"]').last().click();
    await expect(page.locator('[data-prev]')).toBeDisabled();
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Completed');
  });
});

test.describe('guided tour', () => {
  test('opens on load and walks every step, then gives the app back', async ({ page }) => {
    await page.goto(TOUR);
    const card = page.locator('[data-tour-card]');
    await expect(card).toBeVisible();
    const titles = [];
    for (let i = 0; i < 7; i++) {
      await expect(page.locator('[data-tour-step]')).toHaveText(`Step ${i + 1} of 7`);
      titles.push(await page.locator('[data-tour-title]').innerText());
      /* The card is always fully on screen. */
      const box = await card.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(897);
      await page.locator('[data-tour-next]').click();
    }
    expect(titles).toContain('Move the arrival date');
    await expect(card).toBeHidden();
    await expect(page.locator('[data-cycle-pill]')).toHaveText('Active');
    await expect(page.locator('.col')).toHaveCount(7);
    await expect(page.locator('[data-tour-launch]')).toBeVisible();
  });

  test('Escape leaves the tour from the middle and closes what it opened', async ({ page }) => {
    await page.goto(TOUR);
    await page.locator('[data-tour-next]').click();
    await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-order]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tour-card]')).toBeHidden();
    await expect(page.locator('[data-order]')).toBeHidden();
    await page.locator('[data-tour-launch]').click();
    await expect(page.locator('[data-tour-card]')).toBeVisible();
  });
});

test.describe('quality', () => {
  for (const w of [320, 375, 768, 1024, 1280, 1440, 1920]) {
    test(`no sideways page scroll at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(PAGE);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(over).toBeLessThanOrEqual(0);
      /* Card text never spills out of the card, even the 20-character token. */
      const spill = await page.evaluate(() => [...document.querySelectorAll('.ocard')].slice(0, 60)
        .filter(c => c.scrollWidth > c.clientWidth + 1).length);
      expect(spill).toBe(0);
      await page.goto(TOUR);
      const overTour = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overTour).toBeLessThanOrEqual(0);
    });
  }

  test('keyboard focus is visible', async ({ page }) => {
    await page.goto(PAGE);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('reduced motion turns transitions off', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:4811${TOUR}`);
    const t = await page.evaluate(() => getComputedStyle(document.querySelector('[data-tour-hole]')).transitionDuration);
    expect(t.split(',').every(v => parseFloat(v) === 0)).toBe(true);
    await ctx.close();
  });

  test('no console errors and no missing files', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(TOUR);
    for (let i = 0; i < 7; i++) await page.locator('[data-tour-next]').click();
    await page.getByRole('radio', { name: 'Table' }).click();
    await page.locator('[data-table] tbody tr').first().click();
    expect(errors).toEqual([]);
  });
});
