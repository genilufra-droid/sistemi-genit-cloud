function normalizeQuickControls() {
  document.querySelectorAll('.sg-field-heading').forEach((heading) => {
    const label = heading.parentElement;
    if (!label || label.tagName !== 'LABEL') return;
    const caption = heading.querySelector(':scope > span');
    const button = heading.querySelector(':scope > .sg-quick-add');
    if (caption) label.insertBefore(caption, heading);
    if (button) label.insertBefore(button, heading);
    heading.remove();
  });
}

export function installDomSafety() {
  window.requestAnimationFrame(normalizeQuickControls);
  document.addEventListener('click', () => window.setTimeout(normalizeQuickControls, 60), true);
  document.addEventListener('focusin', () => window.setTimeout(normalizeQuickControls, 20), true);
  window.setInterval(normalizeQuickControls, 1200);
}
