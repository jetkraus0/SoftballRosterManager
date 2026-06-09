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

function isValidSpotify(url) {
  return !!parseSpotifyId(url);
}

// ── Spotify IFrame API controller ──────────────────────────────────────────
let embedController = null;
let isPlaying       = false;

// Called by the Spotify script once it loads
window.onSpotifyIframeApiReady = function(IFrameAPI) {
  window._SpotifyAPI = IFrameAPI;
  // If the game tab was already rendered, init now
  const iframe = document.getElementById('spotify-iframe');
  if (iframe) initController(false);
};

function initController(autoplay) {
  const api    = window._SpotifyAPI;
  const iframe = document.getElementById('spotify-iframe');
  if (!api || !iframe) return;

  const trackId = iframe.dataset.trackId;
  if (!trackId) return;

  api.createController(iframe, { uri: `spotify:track:${trackId}` }, ctrl => {
    embedController = ctrl;
    isPlaying = false;
    refreshPlayBtn();

    ctrl.addListener('playback_update', e => {
      isPlaying = !e.data.isPaused;
      refreshPlayBtn();
    });

    if (autoplay) ctrl.play();
  });
}

function loadTrack(trackId, autoplay) {
  const iframe = document.getElementById('spotify-iframe');
  if (!iframe) return;
  iframe.dataset.trackId = trackId;

  if (embedController) {
    isPlaying = false;
    refreshPlayBtn();
    embedController.loadUri(`spotify:track:${trackId}`);
    if (autoplay) setTimeout(() => embedController.play(), 500);
  } else {
    // Controller not ready yet — recreate it
    embedController = null;
    initController(autoplay);
  }
}

function togglePlay() {
  if (embedController) embedController.togglePlay();
}

function playSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}
function pauseSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}

function refreshPlayBtn() {
  const btn = document.getElementById('btn-play-pause');
  if (!btn) return;
  btn.innerHTML = isPlaying ? pauseSVG() : playSVG();
  btn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}

// ── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str ?? ''));
  return d.innerHTML;
}

function animatePop(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = '';
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
    const hasSong  = p.spotifyUrl && isValidSpotify(p.spotifyUrl);
    const songLabel = p.songName || (hasSong ? 'Spotify linked' : 'No song set');
    const numHtml   = p.number !== ''
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
// The game view keeps a stable DOM shell; only inner content updates on navigate.

function renderGame(autoplay = false) {
  const view = document.getElementById('game-view');

  if (!state.players.length) {
    embedController = null;
    isPlaying = false;
    view.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">🎵</span>
        <h3>No Players Yet</h3>
        <p>Go to the <strong>Roster</strong> tab to add your team and their walk-up songs.</p>
      </div>`;
    return;
  }

  if (state.batterIndex >= state.players.length) {
    state.batterIndex = 0;
    saveState();
  }

  // Build stable shell on first render
  if (!document.getElementById('batter-num')) {
    view.innerHTML = `
      <div class="now-batting-label">Now Batting</div>
      <div id="batter-num"  class="batter-number-display">—</div>
      <div id="batter-name" class="batter-name-display">—</div>
      <div id="batter-counter" class="batter-counter">—</div>
      <div id="spotify-section"></div>
      <div class="game-nav">
        <button class="btn-game-nav btn-prev" onclick="navigate(-1)">← Prev</button>
        <button class="btn-game-nav btn-next" onclick="navigate(1)">Next →</button>
      </div>
      <div id="on-deck" class="on-deck-row"></div>
      <button class="btn-reset" onclick="resetBatter()">↺ Reset to First Batter</button>`;
  }

  updateBatter(autoplay);
}

function updateBatter(autoplay) {
  const p       = state.players[state.batterIndex];
  const total   = state.players.length;
  const trackId = p.spotifyUrl ? parseSpotifyId(p.spotifyUrl) : null;

  // Animate and update batter display
  const numEl     = document.getElementById('batter-num');
  const nameEl    = document.getElementById('batter-name');
  const counterEl = document.getElementById('batter-counter');
  const deckEl    = document.getElementById('on-deck');

  animatePop(numEl);
  animatePop(nameEl);

  if (numEl)     numEl.textContent     = p.number !== '' ? '#' + p.number : '—';
  if (nameEl)    nameEl.textContent    = p.name.toUpperCase();
  if (counterEl) counterEl.textContent = `Batter ${state.batterIndex + 1} of ${total}`;

  if (deckEl) {
    if (total > 1) {
      const next = state.players[(state.batterIndex + 1) % total];
      deckEl.innerHTML = `On Deck: <span>${next.number !== '' ? '#' + esc(next.number) + ' ' : ''}${esc(next.name)}</span>`;
    } else {
      deckEl.innerHTML = '';
    }
  }

  // Update Spotify section
  const section       = document.getElementById('spotify-section');
  const existingFrame = document.getElementById('spotify-iframe');

  if (trackId) {
    if (existingFrame) {
      // Best path: keep iframe, just switch track
      loadTrack(trackId, autoplay);
    } else {
      // Create iframe + play button (first time, or after a no-song player)
      embedController = null;
      isPlaying = false;
      section.innerHTML = `
        <div class="spotify-wrap">
          <iframe id="spotify-iframe" data-track-id="${trackId}"
            src="https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0"
            width="100%" height="80" frameborder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"></iframe>
        </div>
        <button id="btn-play-pause" class="btn-play-pause" onclick="togglePlay()" aria-label="Play">
          ${playSVG()}
        </button>`;
      if (window._SpotifyAPI) initController(autoplay);
    }
  } else {
    // Player has no song
    if (existingFrame) {
      embedController = null;
      isPlaying = false;
    }
    if (section) section.innerHTML = `
      <div class="no-song-card">
        🎵 No song set for this player.<br>Add one in the <strong>Roster</strong> tab.
      </div>`;
  }
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
  renderGame(false);
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
  document.getElementById('modal-title').textContent = 'Edit Player';
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

  if (!name) { document.getElementById('input-name').focus(); return; }

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

// ── Share / Import ─────────────────────────────────────────────────────────
function encodeRoster(players) {
  return btoa(JSON.stringify(players))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeRoster(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - pad.length % 4) % 4);
  return JSON.parse(atob(padded));
}

function shareRoster() {
  if (!state.players.length) {
    showToast('Add players first before sharing.');
    return;
  }
  const url = `${location.origin}${location.pathname}?roster=${encodeRoster(state.players)}`;

  if (navigator.share) {
    navigator.share({
      title: 'Walk-Up Songs Roster',
      text: `Softball roster — ${state.players.length} players`,
      url
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Link copied!'))
      .catch(() => { prompt('Copy this link:', url); });
  }
}

// Toast notification
function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// Import from URL
let importPending = null;

function checkImportUrl() {
  const param = new URLSearchParams(location.search).get('roster');
  if (!param) return;
  history.replaceState({}, '', location.pathname); // clean URL
  try {
    const players = decodeRoster(param);
    if (!Array.isArray(players) || !players.length) return;
    if (!players.every(p => p && typeof p.name === 'string')) return;
    importPending = players;
    const banner = document.getElementById('import-banner');
    document.getElementById('import-desc').textContent =
      `${players.length} player${players.length !== 1 ? 's' : ''}`;
    banner.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('visible')));
  } catch (_) {}
}

function dismissImport() {
  importPending = null;
  const banner = document.getElementById('import-banner');
  banner.classList.remove('visible');
  setTimeout(() => banner.classList.add('hidden'), 350);
}

function confirmImport() {
  if (!importPending) return;
  const count = importPending.length;
  state.players = importPending;
  state.batterIndex = 0;
  saveState();
  dismissImport();
  switchTab('roster');
  showToast(`✓ Imported ${count} players`);
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  loadState();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btn-add-player').addEventListener('click', openAdd);
  document.getElementById('btn-cancel').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });
  document.getElementById('player-form').addEventListener('submit', handleSubmit);
  document.getElementById('input-spotify').addEventListener('input', e => {
    setSpotifyStatus(e.target.value.trim());
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  renderRoster();
  checkImportUrl();
}

document.addEventListener('DOMContentLoaded', init);
