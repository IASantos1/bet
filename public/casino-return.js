// Loaded inside the game iframe when the player presses the game's "home" button:
// take the whole ClassicBet tab back to the casino instead of showing the site inside the frame.
try {
  window.top.location.hash = '#/casino';
} catch {
  window.location.href = '/#/casino';
}
