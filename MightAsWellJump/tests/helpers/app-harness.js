import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let caseId = 0;

// app.js runs its top-level wiring (querying elements, attaching listeners,
// reading persisted preferences, constructing the leaderboard client) the
// moment it's imported, so each test needs its own DOM installed as the
// globals *before* import, and its own fresh module instance (the `?case=`
// query string defeats Node's ESM cache, which otherwise would only ever run
// that top-level wiring once for the whole process).
export async function loadApp({ seed } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.HTMLElement = window.HTMLElement;
  global.Event = window.Event;
  // A no-op: none of these tests assert on the timer-display loop that
  // startTimerLoop() drives, and a real rAF binding here would recurse
  // forever (jsdom never stops calling back), leaking a live timer per test
  // that outlives this test's own window and destabilizes the whole suite.
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  window.localStorage.clear();
  // Must run after the new window's localStorage is installed as the global
  // (app.js's persistence calls read the bare `localStorage` global), and
  // before app.js's top-level wiring runs, since resumeSavedGame() reads it.
  seed?.(window.localStorage);

  caseId += 1;
  await import(`../../src/app.js?case=${caseId}`);

  const document = window.document;
  const board = document.getElementById('board');
  const centerSlot = document.getElementById('centerSlot');
  // JSDOM does not run layout, so every element's real getBoundingClientRect
  // is a zero rect; stub the two the input controller reads, matching the
  // fixture geometry already used by tests/interaction.test.js.
  board.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
  centerSlot.getBoundingClientRect = () => ({ left: 78, top: 78, right: 122, bottom: 122, width: 44, height: 44 });
  // JSDOM does not implement <dialog>.showModal()/close(); a plain hidden
  // toggle is enough for these tests, which only assert on dialog content.
  for (const id of ['winDialog', 'infoDialog']) {
    const dialog = document.getElementById(id);
    if (dialog && typeof dialog.showModal !== 'function') {
      dialog.showModal = () => { dialog.open = true; dialog.hidden = false; };
      dialog.close = () => { dialog.open = false; dialog.hidden = true; };
    }
  }

  const fire = (el, type, props) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, props);
    el.dispatchEvent(ev);
  };
  const tap = (el, point) => {
    fire(el, 'pointerdown', { pointerId: 1, clientX: point.x, clientY: point.y });
    fire(el, 'pointerup', { pointerId: 1, clientX: point.x, clientY: point.y });
  };

  return { window, document, board, centerSlot, fire, tap };
}

export function hubTapPoint(centerSlot) {
  const r = centerSlot.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}
