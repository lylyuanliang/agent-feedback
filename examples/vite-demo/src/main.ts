/**
 * Vite Demo Application Main Entrypoint
 */

console.log('[Vite Demo] App mounted successfully.');

const button = document.getElementById('test-log-btn');
if (button) {
  let clickCount = 0;
  button.addEventListener('click', () => {
    clickCount++;
    console.log(`[Vite Demo] User clicked test button, count: ${clickCount}`);
    if (clickCount % 3 === 0) {
      console.warn(`[Vite Demo] Warning: Click count reached milestone ${clickCount}`);
    }
  });
}
