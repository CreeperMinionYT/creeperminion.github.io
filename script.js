/* ================================================================
   CREEPERMINION ARMORY — INTERACTION ENGINE
   Usually you DO NOT need to edit this file to add weapons.
   Add/remove weapons, change positions, and paste URLs in weapons.json.
   Adjust colors/animation/dimming in style.css.
   ================================================================ */

const scene = document.querySelector('#scene');
const layer = document.querySelector('#weapons-layer');
const panel = document.querySelector('#panel');
const panelTitle = document.querySelector('#panel-title');
const closeButton = document.querySelector('#close');
const videoList = document.querySelector('#videos');
const statsList = document.querySelector('#stats');

const ALPHA_THRESHOLD = 55; // Pixels less opaque than this aren't clickable (0–255).
const weaponItems = [];    // Built from weapons.json when the page loads.
let hovered = null;        // Weapon under mouse, if any.
let selected = null;       // Weapon whose popup is open, if any.

function setAppearance() {
  const active = selected || hovered;
  scene.classList.toggle('is-active', Boolean(active));
  weaponItems.forEach(item => item.button.classList.toggle('lit', item === active));
  scene.style.cursor = hovered ? 'pointer' : 'default';
}

// Render all of the resource links. Titles are plain text (safe from HTML injection).
function renderLinks(container, resources) {
  container.replaceChildren();
  const valid = (resources || []).filter(item =>
    item && typeof item.title === 'string' && /^https:\/\//i.test(item.url || '')
  );
  if (!valid.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Links coming soon';
    container.append(empty);
    return;
  }
  valid.forEach(({ title, url }) => {
    const link = document.createElement('a');
    link.className = 'resource';
    link.textContent = title;
    link.href = url;
    link.target = '_blank'; // Keep this armory tab open.
    link.rel = 'noopener noreferrer';
    container.append(link);
  });
}

// For each PNG, cache its pixel transparency once so we can detect
// the actual gun silhouette, instead of a large rectangular hotspot.
function prepareAlphaMap(item) {
  const img = item.image;
  if (!img.complete || !img.naturalWidth) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    item.alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    item.pixelWidth = canvas.width;
    item.pixelHeight = canvas.height;
  } catch (error) {
    // Image can't be inspected (rare for same-origin files): fall back to rectangle.
    console.warn('Could not read image transparency:', img.src, error);
  }
}

function pointerHits(item, clientX, clientY) {
  const bounds = item.button.getBoundingClientRect();
  if (clientX < bounds.left || clientX >= bounds.right ||
      clientY < bounds.top || clientY >= bounds.bottom ||
      !bounds.width || !bounds.height) return false;
  if (!item.alpha) return true; // Image still loading: use rectangle temporarily.
  const x = Math.floor((clientX - bounds.left) / bounds.width * item.pixelWidth);
  const y = Math.floor((clientY - bounds.top) / bounds.height * item.pixelHeight);
  return item.alpha[(y * item.pixelWidth + x) * 4 + 3] > ALPHA_THRESHOLD;
}

function weaponAt(x, y) {
  // Later entries appear on top when PNGs overlap, and receive interaction first.
  for (let i = weaponItems.length - 1; i >= 0; i--) {
    if (pointerHits(weaponItems[i], x, y)) return weaponItems[i];
  }
  return null;
}

// Keep popup near the chosen gun on desktop; prevent clipping at edges.
function positionPanel() {
  if (!selected || panel.hidden) return;
  const rect = selected.button.getBoundingClientRect();
  const width = panel.offsetWidth;
  const canFitRight = rect.right + 16 + width <= window.innerWidth - 12;
  panel.style.left = (canFitRight ? rect.right + 16 : Math.max(12, rect.left - width - 16)) + 'px';
  panel.style.top = Math.max(12, Math.min(rect.top, window.innerHeight - panel.offsetHeight - 12)) + 'px';
}

function setUrlWeapon(id) {
  // Optional deep link: ?weapon=ak47 opens that popup automatically.
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('weapon', id);
  else url.searchParams.delete('weapon');
  window.history.replaceState(null, '', url);
}

function openPanel(item, updateUrl = true) {
  selected = item;
  hovered = null;
  panelTitle.textContent = item.data.name;
  renderLinks(videoList, item.data.videos);
  renderLinks(statsList, item.data.statistics);
  panel.hidden = false;
  positionPanel();
  setAppearance();
  if (updateUrl) setUrlWeapon(item.data.id);
}

function closePanel() {
  if (!selected) return;
  selected = null;
  hovered = null;
  panel.hidden = true;
  setAppearance();
  setUrlWeapon(null);
}

function addWeapon(data) {
  if (!data.id || !data.image || !data.position) return;
  const button = document.createElement('button');
  button.className = 'weapon';
  button.type = 'button';
  button.setAttribute('aria-label', `Explore ${data.name}`);
  button.style.left = data.position.x + '%';
  button.style.top = data.position.y + '%';
  button.style.width = data.position.width + '%';

  const img = document.createElement('img');
  img.src = data.image;
  img.alt = ''; // button's aria-label provides the accessible name.
  img.draggable = false;
  button.append(img);
  layer.append(button);
  const item = { data, button, image: img, alpha: null, pixelWidth: 0, pixelHeight: 0 };
  weaponItems.push(item);

  img.addEventListener('load', () => prepareAlphaMap(item));
  if (img.complete) prepareAlphaMap(item);

  // Pointer hit testing is handled on the scene; keyboard works through buttons.
  button.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(item);
    }
  });
}

scene.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return; // Touch uses tap, no hover.
  hovered = weaponAt(event.clientX, event.clientY);
  setAppearance();
});
scene.addEventListener('pointerleave', () => { hovered = null; setAppearance(); });
scene.addEventListener('click', event => {
  const item = weaponAt(event.clientX, event.clientY);
  if (item) openPanel(item);
  else closePanel(); // Clicking empty wall/counter dismisses popup.
});
document.addEventListener('pointerdown', event => {
  if (selected && !scene.contains(event.target) && !panel.contains(event.target)) closePanel();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
closeButton.addEventListener('click', closePanel);
window.addEventListener('resize', positionPanel);

// Load only the data: no duplicate HTML or JS per weapon.
async function start() {
  try {
    const response = await fetch('weapons.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`weapons.json returned HTTP ${response.status}`);
    const data = await response.json();
    for (const weapon of data.weapons || []) addWeapon(weapon);
    const requested = new URLSearchParams(window.location.search).get('weapon');
    const direct = weaponItems.find(item => item.data.id === requested);
    if (direct) openPanel(direct, false);
  } catch (error) {
    console.error('Armory could not load weapons.json:', error);
    // Site still shows the room; use browser DevTools Console to see this error.
  }
}
start();
