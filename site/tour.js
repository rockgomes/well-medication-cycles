/* The guided tour. It opens on load (add ?tour=0 to skip it).
   Each step first puts the app in the right state (opens the order, moves to
   the next cycle...), then lights up the part it talks about. Leaving the
   tour at any step puts the app back the way it was. */

const Tour = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const hole = $('[data-tour-hole]');
  const card = $('[data-tour-card]');
  const launch = $('[data-tour-launch]');
  const TOP = 64;                        /* the sticky top bar */

  const union = els => {
    const rs = els.filter(Boolean).map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    if (!rs.length) return null;
    const top = Math.min(...rs.map(r => r.top)), left = Math.min(...rs.map(r => r.left));
    return { top, left, width: Math.max(...rs.map(r => r.right)) - left, height: Math.max(...rs.map(r => r.bottom)) - top };
  };
  /* Only light the part of a long element that is on screen. */
  const clip = (r, maxH) => r && { ...r, height: Math.min(r.height, maxH, innerHeight - r.top - 16) };
  const visibleCols = () => $$('.col').filter(c => c.getBoundingClientRect().left < innerWidth - 40);

  const STEPS = [
    {
      title: 'One column per stage',
      text: 'Each stage of an order is a column. The number shows how many orders are in it. The bar shows its share of the cycle.',
      setup: () => { App.setView('board'); },
      scrollTo: () => $('[data-tour="board"]'),
      target: () => clip(union(visibleCols().map(c => c.querySelector('.col-head'))), 200),
    },
    {
      title: 'Problems get their own column',
      text: 'An order with a problem moves to Exceptions. A badge says why, like a labelling query or a clinical query.',
      scrollTo: () => $('[data-col="exceptions"]'),
      target: () => clip(union([$('[data-col="exceptions"] .col-head'), ...$$('[data-col="exceptions"] .ocard').slice(0, 2)]), 560),
    },
    {
      title: 'Open any order',
      text: 'Click a card to see the patient, the item and every package event. Other items for the same patient are in the same order.',
      setup: () => App.openOrder(App.firstCardIn('ready')),
      target: () => $('[data-order]').getBoundingClientRect(),
      keepFocus: true,
    },
    {
      title: 'Find a patient fast',
      text: 'Search by name or NHS number. Sort by the last update or by the date the prescription came in.',
      setup: () => App.closeOrder(),
      scrollTo: () => $('[data-tour="toolbar"]'),
      target: () => $('[data-tour="toolbar"]').getBoundingClientRect(),
    },
    {
      title: 'Board or table',
      text: 'The same orders as a table. A table is easier to scan by patient. People who work on one stage keep the board.',
      setup: () => App.setView('table'),
      scrollTo: () => $('[data-tour="toolbar"]'),
      target: () => clip(union([$('[data-tour="views"]'), $('[data-table]')]), 420),
    },
    {
      title: 'Every cycle in one place',
      text: 'Previous and Next move between cycles. A future cycle is read only, with one exception: the arrival date.',
      setup: () => { App.setView('board'); App.goTo(App.current + 1); },
      scrollTo: () => $('[data-tour="cycles"]'),
      target: () => union([$('[data-tour="cycles"]'), $('[data-banner]')]),
    },
    {
      title: 'Move the arrival date',
      text: 'If there is a problem on the arrival day, the team can move it. The panel says up front that the change is for this cycle only.',
      setup: () => App.openDates(),
      target: () => $('[data-dates]').getBoundingClientRect(),
      keepFocus: true,
      last: true,
    },
  ];

  let on = false, idx = 0, snap = null, blocker = null;

  function place() {
    if (!on) return;
    const r = STEPS[idx].target();
    const pad = 8;
    if (r) {
      Object.assign(hole.style, {
        top: `${r.top - pad}px`, left: `${r.left - pad}px`,
        width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
      });
    }
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16, m = 16;
    let top, left;
    const below = r ? r.top + r.height + pad + gap : 0;
    if (!r) { top = innerHeight - ch - m; left = (innerWidth - cw) / 2; }
    else if (below + ch < innerHeight - m) { top = below; left = r.left; }
    else if (r.top - pad - gap - ch > TOP) { top = r.top - pad - gap - ch; left = r.left; }
    else if (r.left - pad - gap - cw > m) { top = r.top; left = r.left - pad - gap - cw; }
    else if (r.left + r.width + pad + gap + cw < innerWidth - m) { top = r.top; left = r.left + r.width + pad + gap; }
    else { top = innerHeight - ch - m; left = (innerWidth - cw) / 2; }
    card.style.top = `${Math.max(m, Math.min(innerHeight - ch - m, top))}px`;
    card.style.left = `${Math.max(m, Math.min(innerWidth - cw - m, left))}px`;
  }

  async function show(i) {
    idx = i;
    const s = STEPS[i];
    s.setup?.();
    const el = s.scrollTo?.();
    if (el) {
      const y = el.getBoundingClientRect().top + scrollY - TOP - 24;
      scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    $('[data-tour-step]').textContent = `Step ${i + 1} of ${STEPS.length}`;
    $('[data-tour-title]').textContent = s.title;
    $('[data-tour-text]').textContent = s.text;
    $('[data-tour-dots]').innerHTML = STEPS.map((_, n) => `<i class="${n === i ? 'cur' : ''}"></i>`).join('');
    $('[data-tour-back]').hidden = i === 0;
    $('[data-tour-next]').textContent = s.last ? 'Try it yourself' : 'Next';
    place();
    $('[data-tour-next]').focus({ preventScroll: true });
  }

  function start() {
    if (on) return;
    snap = App.snapshot();
    on = true;
    document.body.classList.add('touring');
    blocker = document.createElement('div');
    blocker.style.cssText = 'position:fixed;inset:0;z-index:49';
    document.body.appendChild(blocker);
    hole.hidden = false;
    card.hidden = false;
    launch.hidden = true;
    App.closeMenus();
    show(0);
  }

  function stop() {
    if (!on) return;
    on = false;
    document.body.classList.remove('touring');
    blocker?.remove();
    hole.hidden = true;
    card.hidden = true;
    launch.hidden = false;
    App.restore(snap);
    scrollTo({ top: 0, behavior: 'instant' });
    launch.focus({ preventScroll: true });
  }

  $('[data-tour-next]').addEventListener('click', () => (STEPS[idx].last ? stop() : show(idx + 1)));
  $('[data-tour-back]').addEventListener('click', () => show(Math.max(0, idx - 1)));
  $('[data-tour-exit]').addEventListener('click', stop);
  launch.addEventListener('click', start);
  document.addEventListener('keydown', e => {
    if (!on) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(); }
    if (e.key === 'ArrowRight' && !STEPS[idx].last) show(idx + 1);
    if (e.key === 'ArrowLeft' && idx > 0) show(idx - 1);
    if (e.key === 'Tab') {               /* keep focus in the tour card */
      const f = [...card.querySelectorAll('button')].filter(b => !b.hidden);
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  addEventListener('resize', () => requestAnimationFrame(place));

  if (new URLSearchParams(location.search).get('tour') === '0') launch.hidden = false;
  else start();

  return { start, stop, isOn: () => on };
})();
