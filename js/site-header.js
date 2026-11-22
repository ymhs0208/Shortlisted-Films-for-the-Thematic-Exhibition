import { openDB, readState, withoutStarterRecords } from './db.js';

const countNodes = [...document.querySelectorAll('[data-gallery-count]')];
const setCount = value => {
  const count = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  for (const node of countNodes) node.textContent = `${count} 張`;
};

document.addEventListener('poster-record-count-change', event => setCount(event.detail?.count));

try {
  const db = await openDB();
  const saved = await readState(db);
  setCount(withoutStarterRecords(saved?.records).length);
} catch {
  setCount(0);
}
