'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let state = { players: [], batterIndex: 0 };
let editingId = null;

function loadState() {
  try {
    const s = localStorage.getItem('walkup');
    if (s) {
      const parsed = JSON.parse(s);
      state.players = Array.isArray(parsed.players) ? parsed.players : [];
      state.batterIndex = typeof parsed.batterIndex === 'number' ? parsed.batterIndex : 0;
    }
  } catch (_) {}
}

function saveState() {
  try { localStorage.setItem('walkup', JSON.stringify(state)); } catch (_) {}
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Spotify helpers ────────────────────────────────────────────────────────
function parseSpotifyId(url) {
  if (!url) return null;
  const m = url.match(/(?:spotify:track:|open\.spotify\.com\/(?:[a-z-]+\/)?track\/)([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function embedUrl(spotifyUrl, autoplay = false) {
  const id = parseSpotifyId(spotifyUrl);
  return id ? `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0${autoplay ? '&autoplay=1' : ''}` : null;
}

function isValidSpotify(url) {
  return !!parseSpotifyId(url);
}

// ── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str ?? ''));
  return d.innerHTML;
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  if (name === 'roster') renderRoster();
  if (name === 'game')   renderGame();
}

// ── Roster Rendering ───────────────────────────────────────────────────────
function renderRoster() {
  const list = document.getElementById('roster-list');

  if (!state.players.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🥎</span>
        <h3>No Players Yet</h3>
        <p>Tap the <strong>+</strong> button below to add your first player and their walk-up song.</p>
      </div>`;
    return;
  }

  list.innerHTML = state.players.map((p, i) => {
    const hasSong = p.spotifyUrl && isValidSpotify(p.spotifyUrl);
    const songLabel = p.songName || (hasSong ? 'Spotify linked' : 'No song set');
    const numHtml = p.number !== ''
      ? `#${esc(p.number)}`
      : '<span style="color:var(--muted);font-size:18px">—</span>';

    return `
      <div class="player-card" data-id="${p.id}">
        <div class="player-num">${numHtml}</div>
        <div class="player-info">
          <div class="player-name">${esc(p.name)}</div>
          <div class="player-song-row">
            <span class="song-dot ${hasSong ? '' : 'empty'}"></span>
            <span class="player-song-name">${esc(songLabel)}</span>
          </div>
        </div>
        <div class="player-controls">
          <div class="ctrl-row">
            <button class="btn-icon" onclick="openEdit('${p.id}')" title="Edit">✏️</button>
            <button class="btn-icon danger" onclick="removePlayer('${p.id}')" title="Delete">🗑️</button>
          </div>
          <div class="ctrl-row">
            <button class="btn-icon" onclick="movePlayer('${p.id}',-1)" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-icon" onclick="movePlayer('${p.id}',1)"  title="Move down" ${i === state.players.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Game Rendering ─────────────────────────────────────────────────────────
function renderGame(autoplay = false) {
  const view = document.getElementById('game-view');

  if (!state.players.length) {
    view.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🎵</span>
        <h3>No Players Yet</h3>
        <p>Go to the <strong>Roster</strong> tab to add your team and their walk-up songs.</p>
      </div>`;
    return;
  }

  // Clamp index
  if (state.batterIndex >= state.players.length) {
    state.batterIndex = 0;
    saveState();
  }

  const p     = state.players[state.batterIndex];
  const total = state.players.length;
  const next  = state.players[(state.batterIndex + 1) % total];
  const embed = p.spotifyUrl ? embedUrl(p.spotifyUrl, autoplay) : null;

  view.innerHTML = `
    <div class="now-batting-label">Now Batting</div>
    <div class="batter-number-display">${p.number !== '' ? '#' + esc(p.number) : '—'}</div>
    <div class="batter-name-display">${esc(p.name)}</div>
    <div class="batter-counter">Batter ${state.batterIndex + 1} of ${total}</div>

    ${embed
      ? `<div class="spotify-wrap">
           <iframe
             src="${embed}"
             width="100%" height="152"
             frameborder="0"
             allowfullscreen=""
             allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
             loading="lazy">
           </iframe>
         </div>`
      : `<div class="no-song-card">🎵 No song set for this player.<br>Add one in the <strong>Roster</strong> tab.</div>`
    }

    <div class="game-nav">
      <button class="btn-game-nav btn-prev" onclick="navigate(-1)">← Prev</button>
      <button class="btn-game-nav btn-next" onclick="navigate(1)">Next →</button>
    </div>

    ${total > 1
      ? `<div class="on-deck-row">On Deck: <span>${next.number !== '' ? '#' + esc(next.number) + ' ' : ''}${esc(next.name)}</span></div>`
      : ''}

    <button class="btn-reset" onclick="resetBatter()">↺ Reset to First Batter</button>`;
}

function navigate(dir) {
  const total = state.players.length;
  if (!total) return;
  state.batterIndex = ((state.batterIndex + dir) + total) % total;
  saveState();
  renderGame(true);
}

function resetBatter() {
  state.batterIndex = 0;
  saveState();
  renderGame();
}

// ── Player CRUD ────────────────────────────────────────────────────────────
function openAdd() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Player';
  document.getElementById('input-number').value  = '';
  document.getElementById('input-name').value    = '';
  document.getElementById('input-song').value    = '';
  document.getElementById('input-spotify').value = '';
  clearSpotifyStatus();
  showModal();
}

function openEdit(id) {
  const p = state.players.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById('modal-title').textContent   = 'Edit Player';
  document.getElementById('input-number').value  = p.number;
  document.getElementById('input-name').value    = p.name;
  document.getElementById('input-song').value    = p.songName || '';
  document.getElementById('input-spotify').value = p.spotifyUrl || '';
  setSpotifyStatus(p.spotifyUrl || '');
  showModal();
}

function removePlayer(id) {
  if (!confirm('Remove this player from the roster?')) return;
  state.players = state.players.filter(p => p.id !== id);
  if (state.batterIndex >= state.players.length) {
    state.batterIndex = Math.max(0, state.players.length - 1);
  }
  saveState();
  renderRoster();
}

function movePlayer(id, dir) {
  const idx = state.players.findIndex(p => p.id === id);
  if (idx === -1) return;
  const to = idx + dir;
  if (to < 0 || to >= state.players.length) return;
  [state.players[idx], state.players[to]] = [state.players[to], state.players[idx]];
  saveState();
  renderRoster();
}

// ── Modal ──────────────────────────────────────────────────────────────────
function showModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function clearSpotifyStatus() {
  const el = document.getElementById('spotify-status');
  el.textContent = '';
  el.className = '';
}

function setSpotifyStatus(url) {
  const el = document.getElementById('spotify-status');
  if (!url) { clearSpotifyStatus(); return; }
  if (isValidSpotify(url)) {
    el.textContent = '✓ Valid Spotify link';
    el.className   = 'status-valid';
  } else {
    el.textContent = '✗ Paste a Spotify track link';
    el.className   = 'status-invalid';
  }
}

// ── Form submit ────────────────────────────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();

  const number     = document.getElementById('input-number').value.trim();
  const name       = document.getElementById('input-name').value.trim();
  const songName   = document.getElementById('input-song').value.trim();
  const spotifyUrl = document.getElementById('input-spotify').value.trim();

  if (!name) {
    document.getElementById('input-name').focus();
    return;
  }

  if (spotifyUrl && !isValidSpotify(spotifyUrl)) {
    setSpotifyStatus(spotifyUrl);
    return;
  }

  if (editingId) {
    const p = state.players.find(x => x.id === editingId);
    if (p) { p.number = number; p.name = name; p.songName = songName; p.spotifyUrl = spotifyUrl; }
  } else {
    state.players.push({ id: genId(), number, name, songName, spotifyUrl });
  }

  saveState();
  hideModal();
  renderRoster();
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  loadState();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // FAB
  document.getElementById('btn-add-player').addEventListener('click', openAdd);

  // Modal
  document.getElementById('btn-cancel').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });

  // Form
  document.getElementById('player-form').addEventListener('submit', handleSubmit);

  // Spotify validation
  document.getElementById('input-spotify').addEventListener('input', e => {
    setSpotifyStatus(e.target.value.trim());
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  renderRoster();
}

document.addEventListener('DOMContentLoaded', init);
