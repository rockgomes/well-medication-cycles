/* Fake data for the cycle board. Nothing here is a real person.

   - NHS numbers start with 999. The NHS keeps 999 000 0000 to 999 999 9999
     for test data, so no real patient has one. The last digit is a real
     modulus 11 check digit, so the numbers are valid in format.
   - Residents are born between 1926 and 1956, as in a real care home.
   - Medicines, doses and pack sizes are common care home prescriptions.
   - Everything comes from a seeded random generator, so the board looks the
     same on every load. Only "today" changes it: cycles are worked out from
     today's date (or ?today=YYYY-MM-DD, used by the tests). */

const WellData = (() => {
  /* ---------- seeded random ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  /* ---------- dates ---------- */
  const DAY = 86400000;
  const atNoon = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / DAY);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtShort = d => `${pad(d.getDate())} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  const fmtLong = d => `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
  const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  function readToday() {
    const q = new URLSearchParams(location.search).get('today');
    const m = q && /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : atNoon(new Date());
  }

  /* ---------- identifiers ---------- */
  function nhsNumber(r) {
    for (;;) {
      const d = [9, 9, 9];
      for (let i = 0; i < 6; i++) d.push(int(r, 0, 9));
      const sum = d.reduce((s, v, i) => s + v * (10 - i), 0);
      let check = 11 - (sum % 11);
      if (check === 11) check = 0;
      if (check === 10) continue;           /* not a valid number, try again */
      d.push(check);
      const s = d.join('');
      return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
    }
  }
  const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const block = (r, n) => Array.from({ length: n }, () => pick(r, ALNUM)).join('');
  /* Electronic prescription IDs are 18 characters in three groups. */
  const rxToken = r => `${block(r, 6)}-${block(r, 6)}-${block(r, 6)}`;
  const orderId = r => `${int(r, 1000, 9999)}-${int(r, 1000, 9999)}-${block(r, 4)}`;
  const toteId = r => `T-${int(r, 100000, 999999)}`;

  /* ---------- residents ---------- */
  const WOMEN = ['Margaret', 'Dorothy', 'Joan', 'Patricia', 'Jean', 'Barbara', 'Shirley',
    'Brenda', 'Maureen', 'Irene', 'Sheila', 'Eileen', 'Kathleen', 'Doreen', 'Pauline',
    'Valerie', 'Sylvia', 'Betty', 'Edna', 'Winifred', 'Hazel', 'Gloria', 'Audrey',
    'Joyce', 'Marion', 'Elsie', 'Rita', 'Gwen', 'Iris', 'Vera', 'Rajinder', 'Mary'];
  const MEN = ['John', 'Peter', 'David', 'Michael', 'Brian', 'Kenneth', 'Roy', 'Derek',
    'Dennis', 'Ronald', 'Alan', 'Terence', 'Raymond', 'Geoffrey', 'Leslie', 'Harold',
    'Bernard', 'Colin', 'Stanley', 'Frank', 'Winston', 'Harbans', 'Arthur', 'Albert'];
  const SURNAMES = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson',
    'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts',
    'Green', 'Hall', 'Wood', 'Jackson', 'Clarke', 'Patel', 'Hughes', 'Edwards', 'Turner',
    'Hill', 'Cooper', 'Ward', 'Morris', 'Harris', 'Lewis', 'King', 'Baker', 'Campbell',
    'Murphy', "O'Brien", 'Kowalski', 'Begum', 'Ahmed', 'Bennett', 'Shaw', 'Holt', 'Marsh'];

  /* ---------- medicines ----------
     per: units a day (or a week, for weekly). pack: usual pack size.
     regular: true = a long-term medicine, false = a short course. */
  const MEDS = [
    { name: 'Amlodipine 5mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Atorvastatin 20mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken at night' },
    { name: 'Bisoprolol 2.5mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each morning' },
    { name: 'Ramipril 2.5mg capsules', unit: 'capsule', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Lansoprazole 15mg capsules', unit: 'capsule', per: 1, pack: 28, dose: 'One to be taken each morning', caution: 'Take 30 to 60 minutes before food' },
    { name: 'Omeprazole 20mg capsules', unit: 'capsule', per: 1, pack: 28, dose: 'One to be taken each morning', caution: 'Swallow whole. Do not chew or crush' },
    { name: 'Metformin 500mg tablets', unit: 'tablet', per: 2, pack: 56, dose: 'One to be taken twice a day', add: 'Take with or just after food' },
    { name: 'Levothyroxine 50microgram tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each morning', caution: 'Take 30 to 60 minutes before breakfast' },
    { name: 'Furosemide 40mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each morning' },
    { name: 'Donepezil 10mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken at night' },
    { name: 'Memantine 10mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Sertraline 50mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Mirtazapine 15mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken at night', warn: 'May cause drowsiness' },
    { name: 'Paracetamol 500mg tablets', unit: 'tablet', per: 8, pack: 100, dose: 'Two to be taken four times a day', caution: 'Leave at least 4 hours between doses. No more than 8 tablets in 24 hours', warn: 'Contains paracetamol' },
    { name: 'Senna 7.5mg tablets', unit: 'tablet', per: 2, pack: 60, dose: 'Two to be taken at night' },
    { name: 'Macrogol oral powder sachets', unit: 'sachet', per: 1, pack: 30, dose: 'One sachet to be taken each day', add: 'Mix with half a glass of water' },
    { name: 'Apixaban 2.5mg tablets', unit: 'tablet', per: 2, pack: 56, dose: 'One to be taken twice a day', warn: 'Anticoagulant. Report any unusual bleeding' },
    { name: 'Calcium and vitamin D3 chewable tablets', unit: 'tablet', per: 2, pack: 56, dose: 'One to be chewed twice a day', caution: 'Chew or suck. Do not swallow whole' },
    { name: 'Alendronic acid 70mg tablets', unit: 'tablet', per: 1, weekly: true, pack: 4, dose: 'One to be taken once a week', caution: 'Take with a full glass of water before breakfast. Stay upright for 30 minutes' },
    { name: 'Tamsulosin 400microgram capsules', unit: 'capsule', per: 1, pack: 30, dose: 'One to be taken each day after the same meal', caution: 'Swallow whole. Do not chew or crush' },
    { name: 'Quetiapine 25mg tablets', unit: 'tablet', per: 2, pack: 60, dose: 'One to be taken twice a day', warn: 'May cause drowsiness' },
    { name: 'Lactulose 3.3g/5ml oral solution', unit: 'ml', per: 30, pack: 500, dose: '15ml to be taken twice a day' },
    { name: 'Docusate sodium 100mg capsules', unit: 'capsule', per: 2, pack: 30, dose: 'One to be taken twice a day' },
    { name: 'Folic acid 5mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Gabapentin 300mg capsules', unit: 'capsule', per: 3, pack: 100, dose: 'One to be taken three times a day', warn: 'May cause drowsiness' },
    { name: 'Citalopram 20mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Clopidogrel 75mg tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each day' },
    { name: 'Digoxin 62.5microgram tablets', unit: 'tablet', per: 1, pack: 28, dose: 'One to be taken each morning' },
  ];
  const COURSES = [
    { name: 'Amoxicillin 250mg capsules', unit: 'capsule', qty: 21, pack: 21, dose: 'One to be taken three times a day', add: 'Complete the course', caution: 'Space the doses evenly through the day. Keep taking until the course is finished' },
    { name: 'Nitrofurantoin 50mg capsules', unit: 'capsule', qty: 28, pack: 30, dose: 'One to be taken four times a day', add: 'Complete the course', caution: 'Take with or just after food' },
    { name: 'Prednisolone 5mg tablets', unit: 'tablet', qty: 30, pack: 28, dose: 'Six to be taken each morning for 5 days', caution: 'Take with or just after food' },
  ];
  const plural = (n, unit) => unit === 'ml' ? `${n}ml` : `${n} ${unit}${n === 1 ? '' : 's'}`;

  const STAFF = ['ryan.hale', 'amira.khan', 'tom.okafor', 'lucy.marsh', 'dev.sharma'];
  const staffEmail = r => `${pick(r, STAFF)}@well.example`;

  /* ---------- stages ---------- */
  const STAGES = {
    labelling: { title: 'Labelling and checking', bar: 'amber', badge: 'grey' },
    flowrx: { title: 'FlowRX', bar: 'amber', badge: 'yellow' },
    exceptions: { title: 'Exceptions', bar: 'red', badge: 'red' },
    ready: { title: 'Ready to dispatch', bar: 'brand', badge: 'brand' },
    dispatched: { title: 'Dispatched', bar: 'orange', badge: 'orange' },
    delivered: { title: 'Delivered', bar: 'brand', badge: 'green' },
    cancelled: { title: 'Cancelled', bar: 'grey', badge: 'grey' },
    notDelivered: { title: 'Not delivered', bar: 'amber', badge: 'orange' },
  };
  const ACTIVE_COLUMNS = ['labelling', 'flowrx', 'exceptions', 'ready', 'dispatched', 'delivered', 'cancelled'];
  const DONE_COLUMNS = ['delivered', 'notDelivered'];
  const QUERIES = [
    { label: 'Labelling query', tone: 'red' },
    { label: 'Clinical query', tone: 'blue' },
  ];

  /* ---------- the care home ---------- */
  const HOME = {
    name: 'Silver Oak Assisted Living',
    address: '14 Larch Avenue, Sale, M33 2RT',
    beds: 90,
    occupied: 86,
    contact: 'Ranasa Mbatha',
  };

  function makeResidents() {
    const r = rng(7);
    const used = new Set();
    const list = [];
    while (list.length < HOME.occupied) {
      const female = r() < 0.64;
      const first = pick(r, female ? WOMEN : MEN);
      const last = first === 'Rajinder' ? 'Kaur' : first === 'Harbans' ? 'Singh' : pick(r, SURNAMES);
      const name = `${first} ${last}`;
      if (used.has(name)) continue;
      used.add(name);
      const dob = new Date(int(r, 1926, 1956), int(r, 0, 11), int(r, 1, 28), 12);
      const count = int(r, 4, 11);
      const meds = [];
      while (meds.length < count) {
        const m = pick(r, MEDS);
        if (!meds.includes(m)) meds.push(m);
      }
      list.push({ id: `p${list.length}`, name, female, dob, nhs: nhsNumber(r), meds });
    }
    return list;
  }

  /* ---------- cycles ----------
     Every cycle is 28 days. The anchor is the start of one cycle; all others
     are counted from it. Dispatch is the day before the cycle ends, and the
     arrival date is the last day. */
  const ANCHOR = new Date(2026, 0, 12, 12);
  const LENGTH = 28;

  function cycleAt(index) {
    const start = addDays(ANCHOR, index * LENGTH);
    const end = addDays(start, LENGTH - 1);
    return {
      index,
      start,
      end,
      dispatch: addDays(end, -1),
      arrival: end,
      name: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
    };
  }

  function currentIndex(today) {
    return Math.floor(daysBetween(ANCHOR, today) / LENGTH);
  }

  /* Which stage an item is in, from how far the cycle has got. */
  function stageFor(r, kind, progress) {
    const x = r();
    if (kind === 'upcoming') return 'labelling';
    if (kind === 'completed') return x < 0.025 ? 'notDelivered' : 'delivered';
    if (x < 0.003) return 'cancelled';
    const y = r();
    if (progress >= 1) return y < 0.01 ? 'exceptions' : 'dispatched';
    if (progress < 0.3) return y < 0.6 ? 'labelling' : y < 0.95 ? 'flowrx' : y < 0.98 ? 'exceptions' : 'ready';
    if (progress < 0.7) return y < 0.01 ? 'labelling' : y < 0.32 ? 'flowrx' : y < 0.34 ? 'exceptions' : 'ready';
    return y < 0.005 ? 'labelling' : y < 0.05 ? 'flowrx' : y < 0.065 ? 'exceptions' : 'ready';
  }

  const EVENTS = ['ASN received', 'Dispatch label printed', 'Dispatched', 'Delivered'];
  const EVENTS_BY_STAGE = { ready: 2, dispatched: 3, delivered: 4, notDelivered: 3 };

  function buildCycle(index, today, residents) {
    const c = cycleAt(index);
    const now = currentIndex(today);
    c.kind = index < now ? 'completed' : index > now ? 'upcoming' : 'active';
    const progress = Math.min(1, daysBetween(c.start, today) / (LENGTH - 2));
    c.columns = c.kind === 'completed' ? DONE_COLUMNS : ACTIVE_COLUMNS;

    const r = rng(1000 + index);
    const items = [];
    for (const p of residents) {
      const order = orderId(r);
      const tote = toteId(r);
      const meds = p.meds.slice();
      if (r() < 0.06) meds.push(pick(r, COURSES));     /* a short course this cycle */
      for (const m of meds) {
        if (r() < 0.04) continue;                        /* stopped this cycle */
        const qty = m.qty || (m.weekly ? 4 : m.per * LENGTH);
        let rx = addDays(c.start, -int(r, 7, 20));
        if (rx > today) rx = addDays(today, -int(r, 0, 3));
        const stage = stageFor(r, c.kind, progress);
        const interim = (stage === 'notDelivered' && r() < 0.6) || r() < 0.01;
        const lastDay = c.kind === 'completed' ? c.end : today;
        const updated = new Date(atNoon(rx).getTime() + r() * (atNoon(lastDay) - atNoon(rx)) - 4 * 3600000 + r() * 6 * 3600000);
        const events = [];
        const n = EVENTS_BY_STAGE[stage] || 0;
        /* In the active cycle nothing has happened after today. */
        const anchor = c.kind === 'active' && today < c.dispatch ? addDays(today, -int(r, 0, 2)) : c.dispatch;
        for (let i = 0; i < n; i++) {
          const base = i < 2 ? addDays(anchor, -int(r, 1, 2) + i) : i === 2 ? c.dispatch : c.arrival;
          events.push({
            label: EVENTS[i],
            by: staffEmail(r),
            at: new Date(atNoon(base).getTime() - 4 * 3600000 + int(r, 0, 6 * 3600) * 1000),
          });
        }
        items.push({
          id: `${c.index}-${items.length}`,
          patient: p,
          med: m,
          quantity: plural(qty, m.unit),
          packCount: Math.max(1, Math.ceil(qty / m.pack)),
          packSize: plural(m.pack, m.unit),
          rx,
          updated,
          token: rxToken(r),
          order,
          tote: ['ready', 'dispatched', 'delivered', 'notDelivered'].includes(stage) ? tote : null,
          stage,
          query: stage === 'exceptions' ? QUERIES[r() < 0.6 ? 0 : 1] : null,
          interim,
          events: events.reverse(),
        });
      }
    }
    c.items = items;
    return c;
  }

  return {
    HOME, STAGES, MONTHS, readToday, buildCycle, currentIndex, cycleAt, makeResidents,
    addDays, daysBetween, atNoon, fmtDate, fmtShort, fmtLong, fmtTime,
  };
})();
