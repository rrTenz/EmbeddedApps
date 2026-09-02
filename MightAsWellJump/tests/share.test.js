import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, SHARE_URL, shareResult } from '../src/share.js';

test('SHARE_URL is the canonical public game URL', () => {
  assert.equal(SHARE_URL, 'https://play.survivorgeek.app/might-as-well-jump/');
});

test('buildShareText renders the standard-mode template exactly', () => {
  const text = buildShareText({ mode: 'standard', timeMs: 103000, moves: 68 });
  assert.equal(
    text,
    [
      '🏝️ Might As Well Jump',
      '⏱️ 1:43.0',
      '🎯 68 moves',
      '🟢 Standard',
      '',
      'Can you beat my time?',
      SHARE_URL
    ].join('\n')
  );
});

test('buildShareText uses the dice emoji and Random label for random mode', () => {
  const text = buildShareText({ mode: 'random', timeMs: 45200, moves: 12 });
  assert.match(text, /🎲 Random/);
  assert.doesNotMatch(text, /🟢 Standard/);
});

test('buildShareText uses the actual formatted time and move count', () => {
  const text = buildShareText({ mode: 'standard', timeMs: 61234, moves: 5 });
  assert.match(text, /⏱️ 1:01\.2/);
  assert.match(text, /🎯 5 moves/);
});

function fakeNav(overrides = {}) {
  return { share: undefined, clipboard: undefined, ...overrides };
}
function fakeDoc() {
  const created = [];
  return {
    createElement: tag => {
      const el = {
        tagName: tag,
        style: {},
        value: '',
        setAttribute() {},
        select() {},
        setSelectionRange() {},
        remove() { this.removed = true; }
      };
      created.push(el);
      return el;
    },
    body: { appendChild: el => { el.appended = true; } },
    execCommand: () => true,
    _created: created
  };
}

test('shareResult prefers the Web Share API when available', async () => {
  let called = null;
  const nav = fakeNav({ share: async payload => { called = payload; } });
  const result = await shareResult({ text: 'hello', url: 'https://x', title: 'T', nav, doc: fakeDoc() });
  assert.equal(result.method, 'native');
  assert.equal(result.ok, true);
  assert.deepEqual(called, { title: 'T', text: 'hello', url: 'https://x' });
});

test('shareResult treats a user-cancelled native share as a non-error, non-ok outcome', async () => {
  const nav = fakeNav({
    share: async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
  });
  const result = await shareResult({ text: 'hello', url: 'https://x', nav, doc: fakeDoc() });
  assert.equal(result.method, 'native');
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
});

test('shareResult falls back to the Clipboard API when Web Share is unavailable', async () => {
  let written = null;
  const nav = fakeNav({ clipboard: { writeText: async text => { written = text; } } });
  const result = await shareResult({ text: 'hello world', url: 'https://x', nav, doc: fakeDoc() });
  assert.equal(result.method, 'clipboard');
  assert.equal(result.ok, true);
  assert.match(written, /hello world/);
});

test('shareResult falls back to legacy execCommand copy when neither API is available', async () => {
  const doc = fakeDoc();
  const nav = fakeNav();
  const result = await shareResult({ text: 'hello', url: 'https://x', nav, doc });
  assert.equal(result.method, 'legacy');
  assert.equal(result.ok, true);
  assert.equal(doc._created[0].removed, true, 'the temporary textarea should be cleaned up');
});

test('shareResult reports failure without throwing when every method is unavailable', async () => {
  const doc = fakeDoc();
  doc.execCommand = () => false;
  const nav = fakeNav();
  const result = await shareResult({ text: 'hello', url: 'https://x', nav, doc });
  assert.equal(result.ok, false);
  assert.equal(result.method, 'none');
});
