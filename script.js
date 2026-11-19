/* ================================================================
   CREEPERMINION ARMORY — INTERACTIVE ENGINE
   Normal edits belong in weapons.json (content/positions) or style.css.
   This file handles hover, alpha-transparent hit detection, popup,
   thumbnails, deep links, and mobile interaction for ALL objects.
   ================================================================ */

const scene = document.querySelector('#scene');
const layer = document.querySelector('#weapons-layer');
const panel = document.querySelector('#panel');
const panelTitle = document.querySelector('#panel-title');
const panelSubtitle = document.querySelector('#panel-subtitle');
const closeButton = document.querySelector('#close');
const videoList = document.querySelector('#videos');
const statsList = document.querySelector('#stats');

const ALPHA_THRESHOLD = 55; // PNG pixels with alpha <=55 are NOT interactive (0–255).
const PANEL_GAP = 16;       // Space between highlighted gun and popup, in screen pixels.
const EDGE_MARGIN = 12;     // Minimum distance from viewport edges, in screen pixels.
const weaponItems = [];
let hovered = null;
let selected = null;

function setAppearance() {
  const active = selected || hovered;
  scene.classList.toggle('is-active', Boolean(active));
  weaponItems.forEach(item => item.button.classList.toggle('lit', item === active));
  scene.style.cursor = hovered ? 'pointer' : 'default';
}

// YouTube thumbnail is automatically inferred from ordinary video links.
// Can handle youtube.com/watch?v=ID, youtu.be/ID, /shorts/ID and /live/ID.
// A custom thumbnail URL in weapons.json takes precedence over this.
function youtubeId(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'live', 'embed'].includes(parts[0])) return parts[1] || null;
    }
  } catch { /* Invalid URL — no automatic thumbnail. */ }
  return null;
}

function thumbnailUrl(resource) {
  // Optional: "thumbnail": "assets/resources/my-thumbnail.jpg"
  if (typeof resource.thumbnail === 'string' && resource.thumbnail.trim()) {
    return resource.thumbnail;
  }
  const id = youtubeId(resource.url);
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id)
    ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
    : null;
}

function validLink(resource) {
  if (!resource || typeof resource.title !== 'string' || !resource.title.trim()) return false;
  try { return new URL(resource.url).protocol === 'https:'; }
  catch { return false; }
}

// Render links with optional thumbnails; never insert external text as HTML.
// RESOURCE JSON: { "title":"...", "url":"https://...", "detail":"...",
//                  "thumbnail":"assets/resources/optional-image.jpg" }
function renderLinks(container, resources) {
  container.replaceChildren();
  const entries = (Array.isArray(resources) ? resources : []).filter(validLink);
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Links coming soon';
    container.append(empty);
    return;
  }

  for (const resource of entries) {
    const link = document.createElement('a');
    link.className = 'resource';
    link.href = resource.url;
    link.target = '_blank'; // Visitors stay in the armory tab.
    link.rel = 'noopener noreferrer';

    const thumbSrc = thumbnailUrl(resource);
    if (thumbSrc) {
      const img = document.createElement('img');
      img.className = 'resource-thumb';
      img.src = thumbSrc;
      img.alt = ''; // Decorative: title next to thumbnail describes the destination.
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      // Hide broken/missing thumbnails; link stays usable.
      img.addEventListener('error', () => { img.hidden = true; });
      link.append(img);
    }

    const content = document.createElement('span');
    content.className = 'resource-content';
    const title = document.createElement('span');
    title.className = 'resource-title';
    title.textContent = resource.title;
    content.append(title);

    if (typeof resource.detail === 'string' && resource.detail.trim()) {
      const detail = document.createElement('span');
      detail.className = 'resource-detail';
      detail.textContent = resource.detail;
      content.append(detail);
    }
    link.append(content);

    const arrow = document.createElement('span');
    arrow.className = 'resource-arrow';
    arrow.textContent = '↗';
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow);
    container.append(link);
  }
}

// Cache PNG alpha channel once so transparent regions do NOT activate hover.
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
    console.warn('Could not read PNG transparency:', img.src, error);
  }
}

function pointerHits(item, clientX, clientY) {
  const bounds = item.button.getBoundingClientRect();
  if (clientX < bounds.left || clientX >= bounds.right ||
      clientY < bounds.top || clientY >= bounds.bottom ||
      !bounds.width || !bounds.height) return false;
  if (!item.alpha) return true; // If still loading, temporarily test bounding box.
  const x = Math.floor((clientX - bounds.left) / bounds.width * item.pixelWidth);
  const y = Math.floor((clientY - bounds.top) / bounds.height * item.pixelHeight);
  return item.alpha[(y * item.pixelWidth + x) * 4 + 3] > ALPHA_THRESHOLD;
}

function weaponAt(x, y) {
  // Later entries in weapons.json sit above earlier entries where they overlap.
  for (let i = weaponItems.length - 1; i >= 0; i--) {
    if (pointerHits(weaponItems[i], x, y)) return weaponItems[i];
  }
  return null;
}

function isMobilePanel() {
  return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

// Place panel beside selected weapon when possible; otherwise use the side
// with the most available room. Clamp within the viewport horizontally/vertically.
function positionPanel() {
  if (!selected || panel.hidden) return;
  if (isMobilePanel()) {
    // CSS centers it; clear desktop inline positioning when switching to mobile.
    panel.style.left = '';
    panel.style.top = '';
    return;
  }
  const rect = selected.button.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const rightSpace = window.innerWidth - rect.right - EDGE_MARGIN;
  const leftSpace = rect.left - EDGE_MARGIN;
  let left;
  if (rightSpace >= width + PANEL_GAP) left = rect.right + PANEL_GAP;
  else if (leftSpace >= width + PANEL_GAP) left = rect.left - width - PANEL_GAP;
  else if (rightSpace >= leftSpace) left = rect.right + PANEL_GAP;
  else left = rect.left - width - PANEL_GAP;
  left = Math.min(Math.max(left, EDGE_MARGIN), window.innerWidth - width - EDGE_MARGIN);
  let top = Math.min(Math.max(rect.top, EDGE_MARGIN), window.innerHeight - height - EDGE_MARGIN);
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(EDGE_MARGIN, top)}px`;
}

function setUrlWeapon(id) {
  // Deep link example: https://creeperminionyt.github.io/?weapon=ak47
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('weapon', id);
  else url.searchParams.delete('weapon');
  window.history.replaceState(null, '', url);
}

function openPanel(item, updateUrl = true) {
  selected = item;
  hovered = null;
  panelTitle.textContent = item.data.name;
  const subtitle = (item.data.subtitle || '').trim();
  panelSubtitle.textContent = subtitle;
  panelSubtitle.hidden = !subtitle;
  renderLinks(videoList, item.data.videos);
  renderLinks(statsList, item.data.statistics);
  panel.hidden = false;
  setAppearance();
  positionPanel();
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
  if (!data || !data.id || !data.name || !data.image || !data.position) return;
  const button = document.createElement('button');
  button.className = 'weapon';
  button.type = 'button';
  button.setAttribute('aria-label', `Explore ${data.name}`);
  button.style.left = data.position.x + '%';
  button.style.top = data.position.y + '%';
  button.style.width = data.position.width + '%';

  const img = document.createElement('img');
  img.src = data.image;
  img.alt = '';
  img.draggable = false;
  button.append(img);
  layer.append(button);
  const item = { data, button, image: img, alpha: null, pixelWidth: 0, pixelHeight: 0 };
  weaponItems.push(item);

  img.addEventListener('load', () => prepareAlphaMap(item));
  if (img.complete) prepareAlphaMap(item);
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPanel(item);
    }
  });
}

scene.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || selected) return;
  hovered = weaponAt(event.clientX, event.clientY);
  setAppearance();
});
scene.addEventListener('pointerleave', () => {
  if (selected) return;
  hovered = null;
  setAppearance();
});
scene.addEventListener('click', event => {
  const item = weaponAt(event.clientX, event.clientY);
  if (item) openPanel(item);
  else closePanel(); // Clicking any empty part of the room closes the panel.
});
document.addEventListener('pointerdown', event => {
  if (selected && !scene.contains(event.target) && !panel.contains(event.target)) closePanel();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePanel();
});
closeButton.addEventListener('click', closePanel);
window.addEventListener('resize', positionPanel);

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
  }
}
start();
