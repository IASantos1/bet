/** Render a fixed-height price value, rolling only the digits that visibly changed. */
export function rollingOddsMarkup(previous, current, direction) {
  const currentNumber = Number(current);
  const currentText = Number.isFinite(currentNumber) ? currentNumber.toFixed(2) : '—';
  const previousNumber = previous == null ? NaN : Number(previous);
  const previousText = Number.isFinite(previousNumber) ? previousNumber.toFixed(2) : '';

  if (
    !Number.isFinite(previousNumber)
    || !Number.isFinite(currentNumber)
    || !['up', 'down'].includes(direction)
    || previousText === currentText
  ) {
    return `<span class="odd-value" aria-hidden="true">${currentText}</span>`;
  }

  const rollDirection = currentNumber > previousNumber ? 'up' : 'down';
  const width = Math.max(previousText.length, currentText.length);
  const fromText = previousText.padStart(width, ' ');
  const toText = currentText.padStart(width, ' ');
  const reel = '012345678901234567890';
  let rollIndex = 0;

  const digits = [...toText].map((digit, index) => {
    if (digit === '.') return '<span class="odd-value-separator">.</span>';
    if (digit === ' ') return '<span class="odd-value-digit odd-value-empty">&nbsp;</span>';
    if (!/^\d$/.test(digit)) return `<span class="odd-value-digit">${digit}</span>`;

    const previousDigit = fromText[index];
    if (!/^\d$/.test(previousDigit) || previousDigit === digit) {
      return `<span class="odd-value-digit">${digit}</span>`;
    }

    const fromIndex = 10 + Number(previousDigit);
    let toIndex = 10 + Number(digit);
    if (rollDirection === 'up' && toIndex <= fromIndex) toIndex += 10;
    if (rollDirection === 'down' && toIndex >= fromIndex) toIndex -= 10;
    const delay = rollIndex++ * 18;

    return `<span class="odd-value-digit odd-roll-digit rolling-${rollDirection}" style="--roll-from-y:-${fromIndex}em;--roll-to-y:-${toIndex}em;--roll-delay:${delay}ms"><span class="odd-roll-track">${[...reel].map((value) => `<i>${value}</i>`).join('')}</span></span>`;
  }).join('');

  return `<span class="odd-value" aria-hidden="true">${digits}</span>`;
}
