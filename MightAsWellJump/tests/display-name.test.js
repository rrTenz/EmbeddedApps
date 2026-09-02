import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDisplayName } from '../src/display-name.js';

test('trims whitespace and accepts a normal name', () => {
  const result = validateDisplayName('  Ryan T  ');
  assert.equal(result.ok, true);
  assert.equal(result.name, 'Ryan T');
});

test('collapses internal repeated whitespace', () => {
  const result = validateDisplayName('Ryan     T');
  assert.equal(result.ok, true);
  assert.equal(result.name, 'Ryan T');
});

test('rejects blank input', () => {
  const result = validateDisplayName('   ');
  assert.equal(result.ok, false);
  assert.ok(result.message);
});

test('rejects names shorter than 2 characters', () => {
  const result = validateDisplayName('A');
  assert.equal(result.ok, false);
});

test('rejects names longer than 24 characters', () => {
  const result = validateDisplayName('A'.repeat(25));
  assert.equal(result.ok, false);
});

test('accepts a name at exactly the 24 character boundary', () => {
  const result = validateDisplayName('A'.repeat(24));
  assert.equal(result.ok, true);
});

test('accepts a name at exactly the 2 character boundary', () => {
  const result = validateDisplayName('Al');
  assert.equal(result.ok, true);
});

test('allows letters, numbers, spaces, apostrophes, hyphens, underscores', () => {
  const result = validateDisplayName("O'Brien-Jones_42");
  assert.equal(result.ok, true);
  assert.equal(result.name, "O'Brien-Jones_42");
});

test('rejects obviously malformed input with disallowed symbols', () => {
  const result = validateDisplayName('<script>alert(1)</script>');
  assert.equal(result.ok, false);
});

test('rejects emoji-only input', () => {
  const result = validateDisplayName('🔥🔥🔥');
  assert.equal(result.ok, false);
});

test('rejects non-string input without throwing', () => {
  assert.doesNotThrow(() => validateDisplayName(null));
  assert.equal(validateDisplayName(null).ok, false);
  assert.equal(validateDisplayName(undefined).ok, false);
});
