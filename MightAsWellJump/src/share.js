import { formatTime } from './format.js';

export const SHARE_URL = 'https://play.survivorgeek.app/might-as-well-jump/';

const MODE_LINE = {
  standard: '🟢 Standard',
  random: '🎲 Random'
};

export function buildShareText({ mode, timeMs, moves }) {
  const modeLine = MODE_LINE[mode] || MODE_LINE.standard;
  return [
    '🏝️ Might As Well Jump',
    `⏱️ ${formatTime(timeMs)}`,
    `🎯 ${moves} moves`,
    modeLine,
    '',
    'Can you beat my time?',
    SHARE_URL
  ].join('\n');
}

async function copyWithClipboardApi(nav, text) {
  if (!nav?.clipboard?.writeText) return false;
  try {
    await nav.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function copyWithLegacyTextarea(doc, text) {
  if (!doc?.createElement) return false;
  try {
    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    doc.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = doc.execCommand('copy');
    textarea.remove();
    return Boolean(copied);
  } catch {
    return false;
  }
}

// Preferred order: native share sheet (mobile) -> Clipboard API -> legacy
// execCommand copy. A user cancelling the native share sheet is a normal,
// silent outcome (AbortError), never surfaced as an error.
export async function shareResult({ text, url, title = 'Might As Well Jump', nav, doc }) {
  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ title, text, url });
      return { method: 'native', ok: true, cancelled: false };
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'native', ok: false, cancelled: true };
      return { method: 'native', ok: false, cancelled: false, error };
    }
  }

  const clipboardText = `${text}`;
  if (await copyWithClipboardApi(nav, clipboardText)) {
    return { method: 'clipboard', ok: true, cancelled: false };
  }
  if (copyWithLegacyTextarea(doc, clipboardText)) {
    return { method: 'legacy', ok: true, cancelled: false };
  }
  return { method: 'none', ok: false, cancelled: false };
}
