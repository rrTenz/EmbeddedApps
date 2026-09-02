const MIN_LENGTH = 2;
const MAX_LENGTH = 24;
const ALLOWED_PATTERN = /^[\p{L}\p{N} '_-]+$/u;

export function validateDisplayName(raw) {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';

  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) {
    return { ok: false, name: '', message: `Display name must be ${MIN_LENGTH}-${MAX_LENGTH} characters.` };
  }
  if (!ALLOWED_PATTERN.test(name)) {
    return { ok: false, name: '', message: "Use only letters, numbers, spaces, apostrophes, hyphens, or underscores." };
  }
  return { ok: true, name, message: '' };
}
