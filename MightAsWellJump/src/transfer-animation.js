// A transfer "flight" is a short-lived, purely decorative element that
// travels between the active chute and the hub through its opening. It
// never gates input or the logical state transition: by the time this is
// called, the real state change and re-render have already happened. Each
// flight owns its own element and its own cleanup timer, so overlapping
// flights from fast repeated transfers never interfere with one another,
// and none of them become a second source of game state.
export function playTransferFlight({ container, color, direction, duration = 150, reducedMotion = false }) {
  if (!container) return { cancel() {} };

  const doc = container.ownerDocument;
  const ball = doc.createElement('span');
  ball.className = `flight-ball flight-${direction} ball ${color}`;
  ball.setAttribute('aria-hidden', 'true');
  container.appendChild(ball);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    ball.remove();
  };

  if (reducedMotion) {
    remove();
  } else {
    ball.style.animationDuration = `${duration}ms`;
    setTimeout(remove, duration);
  }

  return { cancel: remove };
}
