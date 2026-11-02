/* The cycle board: one care home, one 28-day cycle at a time.
   Board and table show the same items. Search, sort and the cycle you are on
   apply to both. */

const App = (() => {
  const D = WellData;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const today = D.readToday();
  const residents = D.makeResidents();
  const current = D.currentIndex(today);
  const FIRST = current - 6;          /* how far back Previous goes */
  const LAST = current + 1;           /* only the next cycle is planned */
  const cache = new Map();
  const arrivalEdits = new Map();     /* cycle index -> new arrival date */

  const SORTS = [
    { id: 'updated-desc', label: 'Last updated (newest to oldest)', key: 'updated', dir: -1 },
    { id: 'updated-asc', label: 'Last updated (oldest to newest)', key: 'updated', dir: 1 },
    { id: 'rx-desc', label: 'Prescription received (newest to oldest)', key: 'rx', dir: -1 },
    { id: 'rx-asc', label: 'Prescription received (oldest to newest)', key: 'rx', dir: 1 },
  ];

  const state = { index: current, view: 'board', sort: null, chips: [], text: '' };
  /* Table only: click a column header to sort by it. null = the toolbar sort. */
  state.col = null;   /* { key, dir } */

  const STAGE_ORDER = Object.keys(D.STAGES);
  const COLS = [
    { key: 'name', label: 'Patient name', get: i => i.patient.name },
    { key: 'dob', label: 'Date of birth', get: i => +i.patient.dob },
    { key: 'item', label: 'Item name', get: i => i.med.name },
    { key: 'rx', label: 'Rx received date', get: i => +i.rx },
    { key: 'status', label: 'Status', get: i => STAGE_ORDER.indexOf(i.stage) },
  ];
  function sortByColumn(list) {
    const c = state.col && COLS.find(x => x.key === state.col.key);
    if (!c) return list;
    return list.slice().sort((a, b) => {
      const x = c.get(a), y = c.get(b);
      return (typeof x === 'string' ? x.localeCompare(y, 'en-GB') : x - y) * state.col.dir;
    });
  }

  function cycle(index = state.index) {
    if (!cache.has(index)) cache.set(index, D.buildCycle(index, today, residents));
    const c = cache.get(index);
    const edit = arrivalEdits.get(index);
    if (edit) { c.arrival = edit; c.end = edit; }
    return c;
  }

  /* ---------- filtering and sorting ---------- */
  const digits = s => s.replace(/\D/g, '');
  function matchesText(item, text) {
    if (!text) return true;
    const t = text.toLowerCase();
    const d = digits(text);
    return item.patient.name.toLowerCase().includes(t) ||
      item.med.name.toLowerCase().includes(t) ||
      (d.length >= 3 && digits(item.patient.nhs).includes(d));
  }
  function visibleItems(c = cycle()) {
    let list = c.items;
    if (state.chips.length) list = list.filter(i => state.chips.includes(i.patient.id));
    if (state.text) list = list.filter(i => matchesText(i, state.text));
    const s = SORTS.find(x => x.id === state.sort) || SORTS[0];
    return list.slice().sort((a, b) => (a[s.key] - b[s.key]) * s.dir);
  }

  /* ---------- care home header ---------- */
  function fillHome() {
    const h = D.HOME;
    $$('[data-home-name]').forEach(el => { el.textContent = h.name; });
    $('[data-home-address]').textContent = h.address;
    $('[data-home-beds]').textContent = h.beds;
    $('[data-home-occupied]').textContent = h.occupied;
    $('[data-home-contact]').textContent = h.contact;
  }

  /* ---------- cycle navigation ---------- */
  const PILL = { active: 'Active', upcoming: 'Upcoming', completed: 'Completed' };
  const range = c => `${D.fmtLong(c.start)} - ${D.fmtLong(c.end)} ${c.end.getFullYear()}`;

  function renderNav() {
    const c = cycle();
    $('[data-cycle-range]').textContent = range(c);
    const pill = $('[data-cycle-pill]');
    pill.className = `pill ${c.kind}`;
    pill.textContent = PILL[c.kind];
    const dispatch = $('[data-dispatch]');
    dispatch.hidden = c.kind !== 'active';
    dispatch.textContent = `Dispatch ${D.fmtShort(c.dispatch)}`;
    $('[data-prev]').disabled = state.index <= FIRST;
    $('[data-next]').disabled = state.index >= LAST;

    const banner = $('[data-banner]');
    banner.hidden = c.kind === 'active';
    $('[data-banner-text]').textContent = c.kind === 'upcoming'
      ? ` · ${c.name} cycle hasn't started yet.`
      : ` · ${c.name} cycle is closed and cannot be edited.`;
    $('[data-edit-arrival]').hidden = c.kind !== 'upcoming';
  }

  function renderCycleMenu() {
    const list = $('[data-cycle-list]');
    let html = '';
    for (let i = LAST; i >= FIRST; i--) {
      const c = cycle(i);
      html += `<button type="button" role="menuitemradio" aria-checked="${i === state.index}" data-go="${i}">
        <span>${esc(range(c))}</span><span class="pill ${c.kind}">${PILL[c.kind]}</span></button>`;
    }
    list.innerHTML = html;
  }

  /* ---------- board ---------- */
  const CHUNK = 30;
  let observers = [];

  function cardHTML(item) {
    const p = item.patient;
    const rows = [
      ['Date of Birth', D.fmtDate(p.dob)],
      ['NHS Nº', p.nhs],
      ['RX Received', D.fmtDate(item.rx)],
      ['RX Token', item.token],
    ];
    if (item.tote) rows.push(['Tote ID', item.tote]);
    return `<button type="button" class="ocard" data-item="${item.id}">
      ${item.interim ? `<span class="interim" data-tip-text="Interim pharmacy, not part of Well"><img src="icons/interim.svg" alt=""></span><span class="sr">Interim pharmacy, not part of Well.</span>` : ''}
      ${item.query ? `<span class="query ${item.query.tone}">${item.query.label}</span>` : ''}
      <span class="ocard-head">
        <span class="ocard-title"><strong>${esc(item.med.name)}</strong><img src="icons/grip-horizontal.svg" width="24" height="24" alt=""></span>
        <span class="ocard-who">${esc(p.name)}</span>
      </span>
      <dl>${rows.map(([k, v]) => `<div class="row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </button>`;
  }

  function renderBoard() {
    const c = cycle();
    const items = visibleItems(c);
    const board = $('[data-board]');
    observers.forEach(o => o.disconnect()); observers = [];
    board.classList.toggle('two', c.columns.length === 2);
    const total = items.length || 1;
    const groups = Object.fromEntries(c.columns.map(k => [k, []]));
    for (const it of items) (groups[it.stage] || (groups[it.stage] = [])).push(it);

    board.innerHTML = c.columns.map(key => {
      const s = D.STAGES[key];
      const n = groups[key].length;
      const pct = (n / total) * 100;
      const label = pct === 0 ? '0%' : pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
      return `<section class="col" data-col="${key}" aria-label="${esc(s.title)}, ${n} orders">
        <div class="col-head">
          <h2 class="col-title"><span>${esc(s.title)}</span><span>${n}</span></h2>
          <div class="bar"><span class="track"><span class="fill ${s.bar}" data-w="${pct}"></span></span><span class="pct">${label}</span></div>
        </div>
        <div class="cards" data-cards="${key}"></div>
      </section>`;
    }).join('');

    for (const key of c.columns) {
      const box = $(`[data-cards="${key}"]`, board);
      box._items = groups[key];
      box._shown = 0;
      /* Each column scrolls on its own, so each one watches its own scroll for the next batch. */
      box._io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) fillColumn(key);
      }, { root: box, rootMargin: '0px 0px 800px 0px' });
      observers.push(box._io);
      box.addEventListener('scroll', () => box.parentElement.classList.toggle('scrolled', box.scrollTop > 0), { passive: true });
      fillColumn(key);
    }
    fitBoard();
    requestAnimationFrame(() => $$('.fill', board).forEach(f => { f.style.width = `${f.dataset.w}%`; }));
  }

  function fillColumn(key) {
    const box = $(`[data-cards="${key}"]`);
    if (!box) return;
    const next = box._items.slice(box._shown, box._shown + CHUNK);
    box._shown += next.length;
    $('[data-sentinel]', box)?.remove();
    box.insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
    if (box._shown < box._items.length) {
      const s = document.createElement('div');
      s.dataset.sentinel = key;
      s.style.height = '1px';
      box.appendChild(s);
      box._io.observe(s);
    }
    if (box._items.length) box.style.marginTop = '0';
  }

  /* ---------- table ---------- */
  const TABLE_CHUNK = 60;
  function renderTable() {
    const items = sortByColumn(visibleItems());
    const wrap = $('[data-table]');
    const rows = items.slice(0, TABLE_CHUNK);
    const head = COLS.map(c => {
      const on = state.col?.key === c.key ? state.col.dir : 0;
      const sort = on === 1 ? 'ascending' : on === -1 ? 'descending' : 'none';
      const path = on === 1 ? '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'
        : on === -1 ? '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'
        : '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>';
      return `<th scope="col" aria-sort="${sort}"><button class="th-sort${on ? ' on' : ''}" type="button" data-col-sort="${c.key}">${c.label}<svg class="i" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button></th>`;
    }).join('');
    /* Fixed widths (Figma list view: 240, 168, 343, 183, 195 of 1129), so filtering or sorting never moves the columns. */
    wrap.innerHTML = `<table>
      <colgroup><col style="width:21.3%"><col style="width:14.9%"><col style="width:30.4%"><col style="width:16.2%"><col style="width:13.7%"><col style="width:3.5%"></colgroup>
      <thead><tr>${head}<th scope="col"><span class="sr">Open</span></th></tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody></table>
      ${items.length > TABLE_CHUNK ? `<p class="table-note"><button class="btn outline more" type="button" data-more-rows>Show more (${items.length - TABLE_CHUNK} left)</button></p>` : ''}`;
    wrap._items = items;
    wrap._shown = rows.length;
  }
  function rowHTML(item) {
    const s = D.STAGES[item.stage];
    return `<tr tabindex="0" data-item="${item.id}">
      <td>${esc(item.patient.name)}</td><td>${D.fmtDate(item.patient.dob)}</td>
      <td title="${esc(item.med.name)}">${esc(item.med.name)}${item.interim ? ` <span class="interim inline" data-tip-text="Interim pharmacy, not part of Well"><img src="icons/interim.svg" alt="Interim pharmacy"></span>` : ''}</td>
      <td>${D.fmtDate(item.rx)}</td><td><span class="badge ${s.badge}">${esc(s.title)}</span></td>
      <td class="go"><svg class="i" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></td></tr>`;
  }
  function moreRows() {
    const wrap = $('[data-table]');
    const next = wrap._items.slice(wrap._shown, wrap._shown + TABLE_CHUNK);
    wrap._shown += next.length;
    $('tbody', wrap).insertAdjacentHTML('beforeend', next.map(rowHTML).join(''));
    const left = wrap._items.length - wrap._shown;
    const btn = $('[data-more-rows]', wrap);
    if (left > 0) btn.textContent = `Show more (${left} left)`;
    else btn.parentElement.remove();
  }

  /* ---------- board height ----------
     Like Trello: the page scrolls until the cycle bar (Previous / Next) reaches the top bar,
     then stops. The board fills the rest of the screen and each column scrolls on its own. */
  const TOPBAR = 64;
  const GAP = 12;
  function fitBoard() {
    const board = $('[data-board]');
    if (board.hidden) return;
    const stack = board.getBoundingClientRect().top - $('[data-tour="cycles"]').getBoundingClientRect().top;
    const pad = parseFloat(getComputedStyle($('.content')).paddingBottom) || 0;
    board.style.height = `${Math.max(360, innerHeight - TOPBAR - GAP - stack - pad)}px`;
  }
  function maxPageScroll() { return document.documentElement.scrollHeight - innerHeight; }

  /* ---------- render all ---------- */
  function render() {
    renderNav();
    const items = visibleItems();
    const table = state.view === 'table';
    $('[data-board]').hidden = table;
    $('[data-table]').hidden = !table;
    $('[data-empty]').hidden = items.length > 0 || !(state.chips.length || state.text);
    if (table) renderTable(); else renderBoard();
    $$('[data-view]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === state.view)));
    const s = SORTS.find(x => x.id === state.sort);
    $('[data-sort-label]').innerHTML = s ? `Sort by: <b>${esc(s.label)}</b>` : 'Sorting';
    renderChips();
  }

  function goTo(index) {
    state.index = Math.max(FIRST, Math.min(LAST, index));
    render();
  }

  /* ---------- search ---------- */
  let suggestIndex = -1;
  function suggestions() {
    const t = state.text.trim();
    if (!t) return [];
    const lower = t.toLowerCase();
    const d = digits(t);
    return residents.filter(p => !state.chips.includes(p.id) &&
      (p.name.toLowerCase().includes(lower) || (d.length >= 3 && digits(p.nhs).includes(d)))).slice(0, 8);
  }
  function renderSuggest() {
    const list = $('[data-suggest]');
    const input = $('[data-search]');
    const found = suggestions();
    list.hidden = !found.length;
    input.setAttribute('aria-expanded', String(!!found.length));
    if (suggestIndex >= found.length) suggestIndex = found.length - 1;
    list.innerHTML = found.map((p, i) => `<li role="option" id="opt-${p.id}" aria-selected="${i === suggestIndex}" data-pick="${p.id}">
      <span>${esc(p.name)}</span><span>${p.nhs}</span></li>`).join('');
    if (suggestIndex >= 0 && found[suggestIndex]) input.setAttribute('aria-activedescendant', `opt-${found[suggestIndex].id}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function pickPatient(id) {
    if (!state.chips.includes(id)) state.chips.push(id);
    state.text = '';
    $('[data-search]').value = '';
    suggestIndex = -1;
    renderSuggest();
    render();
  }
  function renderChips() {
    const box = $('[data-chips]');
    box.hidden = !state.chips.length;
    box.innerHTML = state.chips.map(id => {
      const p = residents.find(r => r.id === id);
      return `<span class="chip">${esc(p.name)} <span>${p.nhs}</span><button type="button" aria-label="Remove ${esc(p.name)}" data-unpick="${id}">×</button></span>`;
    }).join('');
  }

  /* ---------- menus ---------- */
  function toggleMenu(btn, list, open) {
    const show = open ?? list.hidden;
    closeMenus();
    list.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    if (show) list.querySelector('[aria-checked="true"], button')?.focus();
  }
  function closeMenus() {
    $$('[data-cycle-list], [data-sort-list]').forEach(m => { m.hidden = true; });
    $$('[data-cycle-menu], [data-sort-btn]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }
  function renderSortMenu() {
    $('[data-sort-list]').innerHTML = SORTS.map(s =>
      `<button type="button" role="menuitemradio" aria-checked="${s.id === state.sort}" data-sort="${s.id}">${esc(s.label)}</button>`).join('');
  }

  /* ---------- order dialog ---------- */
  let lastFocus = null;
  const findItem = id => cycle().items.find(i => i.id === id);

  function itemDetails(item, full) {
    const m = item.med;
    const rows = [['Quantity', item.quantity]];
    if (full) rows.push(['Pack count', item.packCount], ['Pack size', item.packSize]);
    rows.push(['Dosage instructions', m.dose], ['Additional instructions', m.add || 'None'],
      ['Cautions', m.caution || 'None'], ['Warnings', m.warn || 'None']);
    return `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  function openOrder(item) {
    if (!item) return;
    lastFocus = document.activeElement;
    const p = item.patient;
    const s = D.STAGES[item.stage];
    const labelled = item.stage !== 'labelling';
    const others = cycle().items.filter(i => i.patient === p && i !== item);
    const events = item.events.length
      ? `<table><thead><tr><th scope="col">Status</th><th scope="col">Updates</th></tr></thead><tbody>
          ${item.events.map(e => `<tr><td>${e.label}</td><td><div class="by">${esc(e.by)}</div>
          <div class="when">${D.fmtDate(e.at)}<span>${D.fmtTime(e.at)}</span></div></td></tr>`).join('')}</tbody></table>`
      : `<p class="events-empty">No package events yet. They start when the order is packed.</p>`;
    $('[data-order-body]').innerHTML = `
      <span class="badge ${s.badge} stage-badge">${esc(s.title)}</span>
      <div><h2 id="order-title">Order ID</h2><span class="id-chip">${item.order}<img src="icons/info-sm.svg" width="12" height="12" alt=""></span></div>
      <div class="dialog-cols">
        <div class="stack">
          <div class="patient">
            <div class="patient-name">${esc(p.name)}<span class="nhs" title="NHS number">${p.nhs}<img src="icons/info-blue.svg" width="14" height="14" alt=""></span></div>
            <div class="patient-meta">
              <span><img src="icons/calendar-sm.svg" width="14" height="14" alt="">${D.fmtDate(p.dob)}</span>
              <span><img src="icons/user.svg" width="14" height="14" alt="">${p.female ? 'Female' : 'Male'}</span>
            </div>
          </div>
          <div><p class="sub">Package events</p><div class="events">${events}</div></div>
        </div>
        <div class="stack">
          <div><p class="sub">Item</p>
            <div class="item"><h3>${esc(item.med.name)}${item.interim ? `<span class="interim inline" data-tip-text="Interim pharmacy, not part of Well"><img src="icons/interim.svg" alt="Interim pharmacy"></span>` : ''}</h3>${itemDetails(item, labelled)}</div>
          </div>
          ${others.length ? `<div class="acc">
            <button type="button" aria-expanded="false" aria-controls="acc-list" data-acc><span>Other items in this order</span><img src="icons/chevron-down-lg.svg" width="18" height="18" alt=""></button>
            <p class="count">${others.length} items</p>
            <div class="acc-list" id="acc-list" hidden>${others.map(o => `<div class="item"><h3>${esc(o.med.name)}</h3>
              <dl class="kv"><div><dt>Quantity</dt><dd>${esc(o.quantity)}</dd></div><div><dt>Dosage instructions</dt><dd>${esc(o.med.dose)}</dd></div><div><dt>Status</dt><dd>${esc(D.STAGES[o.stage].title)}</dd></div></dl></div>`).join('')}</div>
          </div>` : ''}
        </div>
      </div>`;
    $('[data-scrim]').hidden = false;
    $('[data-order]').hidden = false;
    $('[data-order] .dialog-foot .btn').focus();
  }
  function closeOrder() {
    if ($('[data-order]').hidden) return;
    $('[data-order]').hidden = true;
    if ($('[data-dates]').hidden) $('[data-scrim]').hidden = true;
    lastFocus?.focus?.();
  }

  /* ---------- cycle dates ----------
     Only the arrival date of an upcoming cycle can move. It can be any day
     from dispatch to a week after it. */
  let draft = null;
  let calMonth = null;
  function openDates() {
    const c = cycle();
    if (c.kind !== 'upcoming') return;
    lastFocus = document.activeElement;
    draft = c.arrival;
    /* Show the start month first, so start, dispatch and arrival are all in view. */
    calMonth = new Date(c.start.getFullYear(), c.start.getMonth(), 1, 12);
    $('[data-dates-cycle]').textContent = c.name;
    $('[data-d-start]').textContent = D.fmtDate(c.start);
    $('[data-d-dispatch]').textContent = D.fmtDate(c.dispatch);
    renderCal();
    $('[data-scrim]').hidden = false;
    $('[data-dates]').hidden = false;
    $('[data-cal] .arrival')?.focus();
  }
  function closeDates() {
    if ($('[data-dates]').hidden) return;
    $('[data-dates]').hidden = true;
    $('[data-scrim]').hidden = true;
    lastFocus?.focus?.();
  }
  function renderCal() {
    const c = cycle();
    $('[data-d-arrival]').textContent = D.fmtDate(draft);
    const min = c.dispatch, max = D.addDays(c.dispatch, 7);
    const same = (a, b) => a && b && D.daysBetween(a, b) === 0;
    const month = offset => {
      const first = new Date(calMonth.getFullYear(), calMonth.getMonth() + offset, 1, 12);
      const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      let cells = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => `<span class="dow">${d}</span>`).join('');
      cells += '<span class="blank"></span>'.repeat(first.getDay());
      for (let d = 1; d <= days; d++) {
        const day = new Date(first.getFullYear(), first.getMonth(), d, 12);
        const cls = same(day, c.start) ? 'start' : same(day, c.dispatch) ? 'dispatch' : same(day, draft) ? 'arrival' : same(day, today) ? 'today' : '';
        const ok = D.daysBetween(min, day) >= 0 && D.daysBetween(day, max) >= 0 && !same(day, c.dispatch);
        cells += `<button type="button" class="${cls}" ${ok ? '' : 'disabled'} data-day="${day.getTime()}"
          aria-label="${d} ${D.MONTHS[first.getMonth()]} ${first.getFullYear()}${cls ? `, ${cls}` : ''}" aria-pressed="${cls === 'arrival'}">${d}</button>`;
      }
      return `<div class="cal-month"><h3>${D.MONTHS[first.getMonth()]} ${first.getFullYear()}</h3><div class="cal-grid">${cells}</div></div>`;
    };
    $('[data-cal]').innerHTML = `
      <button class="cal-step prev" type="button" aria-label="Previous month" data-cal-step="-1"><svg class="i" width="16" height="16" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
      <button class="cal-step next" type="button" aria-label="Next month" data-cal-step="1"><svg class="i" width="16" height="16" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
      ${month(0)}${month(1)}`;
  }
  function confirmDates() {
    const c = cycle();
    if (D.daysBetween(c.arrival, draft) !== 0) {
      arrivalEdits.set(c.index, draft);
      render();
      toast(`Arrival date for the ${c.name} cycle is now ${D.fmtLong(draft)}.`);
    }
    closeDates();
  }

  /* ---------- toast and tooltip ---------- */
  let toastTimer = 0;
  function toast(text) {
    const t = $('[data-toast]');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function showTip(el) {
    const tip = $('[data-tip]');
    tip.textContent = el.dataset.tipText;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${Math.max(8, r.top - h - 6)}px`;
  }

  /* ---------- events ---------- */
  function bind() {
    $('[data-prev]').addEventListener('click', () => goTo(state.index - 1));
    $('[data-next]').addEventListener('click', () => goTo(state.index + 1));
    $('[data-back-current]').addEventListener('click', () => goTo(current));
    $('[data-edit-arrival]').addEventListener('click', openDates);
    $('[data-cycle-menu]').addEventListener('click', e => { renderCycleMenu(); toggleMenu(e.currentTarget, $('[data-cycle-list]')); });
    $('[data-cycle-list]').addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      closeMenus();
      goTo(+b.dataset.go);
      $('[data-cycle-menu]').focus();
    });
    $('[data-sort-btn]').addEventListener('click', e => { renderSortMenu(); toggleMenu(e.currentTarget, $('[data-sort-list]')); });
    $('[data-sort-list]').addEventListener('click', e => {
      const b = e.target.closest('[data-sort]');
      if (!b) return;
      state.sort = b.dataset.sort;
      state.col = null;
      closeMenus();
      render();
      $('[data-sort-btn]').focus();
    });
    $$('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
    $('.seg').addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      state.view = state.view === 'board' ? 'table' : 'board';
      render();
      $(`[data-view="${state.view}"]`).focus();
    });

    const input = $('[data-search]');
    input.addEventListener('input', () => { state.text = input.value; suggestIndex = -1; renderSuggest(); render(); });
    input.addEventListener('keydown', e => {
      const found = suggestions();
      if (e.key === 'ArrowDown' && found.length) { e.preventDefault(); suggestIndex = (suggestIndex + 1) % found.length; renderSuggest(); }
      else if (e.key === 'ArrowUp' && found.length) { e.preventDefault(); suggestIndex = (suggestIndex - 1 + found.length) % found.length; renderSuggest(); }
      else if (e.key === 'Enter' && found.length) { e.preventDefault(); pickPatient(found[Math.max(0, suggestIndex)].id); }
      else if (e.key === 'Escape' && !$('[data-suggest]').hidden) { e.stopPropagation(); $('[data-suggest]').hidden = true; input.setAttribute('aria-expanded', 'false'); }
    });
    input.addEventListener('focus', renderSuggest);
    $('[data-suggest]').addEventListener('mousedown', e => {
      const li = e.target.closest('[data-pick]');
      if (li) { e.preventDefault(); pickPatient(li.dataset.pick); input.focus(); }
    });
    $('[data-chips]').addEventListener('click', e => {
      const b = e.target.closest('[data-unpick]');
      if (!b) return;
      state.chips = state.chips.filter(id => id !== b.dataset.unpick);
      render();
      ($('[data-unpick]') || input).focus();
    });

    document.addEventListener('click', e => {
      const card = e.target.closest('[data-item]');
      if (card && !e.target.closest('[data-order]')) openOrder(findItem(card.dataset.item));
      if (e.target.closest('[data-more-rows]')) moreRows();
      const colBtn = e.target.closest('[data-col-sort]');
      if (colBtn) {
        /* A to Z, then Z to A, then back to the toolbar sort. */
        const key = colBtn.dataset.colSort;
        const dir = state.col?.key === key ? state.col.dir : 0;
        state.col = dir === 0 ? { key, dir: 1 } : dir === 1 ? { key, dir: -1 } : null;
        render();
        $(`[data-col-sort="${key}"]`)?.focus();
      }
      if (e.target.closest('[data-close]')) closeOrder();
      if (e.target.closest('[data-dates-close]')) closeDates();
      if (e.target.matches('[data-scrim]')) { closeOrder(); closeDates(); }
      const acc = e.target.closest('[data-acc]');
      if (acc) {
        const open = acc.getAttribute('aria-expanded') !== 'true';
        acc.setAttribute('aria-expanded', String(open));
        $('#acc-list').hidden = !open;
      }
      if (!e.target.closest('.menu-wrap')) closeMenus();
      if (!e.target.closest('.search-wrap')) { $('[data-suggest]').hidden = true; input.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', e => {
      const row = e.target.closest?.('tr[data-item]');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openOrder(findItem(row.dataset.item)); }
      if (e.key !== 'Escape') return;
      if (window.Tour?.isOn()) return;            /* the tour handles its own Escape */
      if (!$('[data-cycle-list]').hidden || !$('[data-sort-list]').hidden) {
        const btn = !$('[data-cycle-list]').hidden ? $('[data-cycle-menu]') : $('[data-sort-btn]');
        closeMenus(); btn.focus(); return;
      }
      if (!$('[data-order]').hidden) closeOrder();
      else if (!$('[data-dates]').hidden) closeDates();
    });
    /* keep Tab inside an open dialog */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const box = !$('[data-order]').hidden ? $('[data-order]') : !$('[data-dates]').hidden ? $('[data-dates]') : null;
      if (!box || window.Tour?.isOn()) return;
      const f = $$('button:not(:disabled), [href], input, [tabindex="0"]', box).filter(el => el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    $('[data-cal]').addEventListener('click', e => {
      const step = e.target.closest('[data-cal-step]');
      if (step) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +step.dataset.calStep, 1, 12); renderCal(); return; }
      const day = e.target.closest('[data-day]');
      if (day && !day.disabled) {
        draft = new Date(+day.dataset.day);
        renderCal();
        $(`[data-day="${day.dataset.day}"]`)?.focus();
      }
    });
    $('[data-dates-confirm]').addEventListener('click', confirmDates);

    document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip-text]'); if (t) showTip(t); });
    document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip-text]')) $('[data-tip]').hidden = true; });
    addEventListener('scroll', () => { $('[data-tip]').hidden = true; }, { passive: true, capture: true });
  }

  /* ---------- for the tour ---------- */
  function snapshot() { return JSON.stringify({ ...state, edits: [...arrivalEdits] }); }
  function restore(snap) {
    const s = JSON.parse(snap);
    Object.assign(state, { index: s.index, view: s.view, sort: s.sort, col: s.col, chips: s.chips, text: s.text });
    arrivalEdits.clear();
    for (const [k, v] of s.edits) arrivalEdits.set(k, new Date(v));
    for (const c of cache.values()) { const r = D.cycleAt(c.index); if (!arrivalEdits.has(c.index)) { c.arrival = r.arrival; c.end = r.end; } }
    $('[data-search]').value = state.text;
    closeMenus(); closeOrder(); closeDates();
    render();
  }
  function firstCardIn(stage) { return visibleItems().find(i => i.stage === stage) || visibleItems()[0]; }

  fillHome();
  bind();
  render();

  addEventListener('resize', fitBoard);
  const ro = new ResizeObserver(fitBoard);
  ['[data-tour="cycles"]', '[data-banner]', '[data-tour="toolbar"]', '[data-chips]'].forEach(sel => ro.observe($(sel)));
  /* Scrolling down over a column moves the page first, until the cycle bar reaches the top. */
  $('[data-board]').addEventListener('wheel', e => {
    if (e.deltaY <= 0 || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const room = maxPageScroll() - scrollY;
    if (room < 1) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    scrollBy({ top: Math.min(dy, room), behavior: 'instant' });
  }, { passive: false });

  return {
    state, current, today, goTo, render, openOrder, closeOrder, openDates, closeDates, closeMenus,
    snapshot, restore, firstCardIn, smooth: () => !reducedMotion.matches,
    setView(v) { state.view = v; render(); },
  };
})();
