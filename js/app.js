/**
 * MusicFlow - Complete Self-Contained Music Player Engine & Controller
 * Features:
 * 1. Settings & Customization Suite:
 *    - Device MP3/Audio Scanner with direct storage access & background non-blocking import.
 *    - Crossfade (Desbotamento de 1s a 12s) with volume slope transitions.
 *    - Gapless Playback (Reprodução sem interrupções).
 *    - Sleep Timer (Desligamento Automático) with live countdown.
 *    - Multi-Theme Suite (Spotify Dark, Neon Indigo, Cyberpunk Amber, Rose Night, Arctic Light).
 *    - Background Playback & MediaSession API (Lock screen / notification center controls on Android/iOS).
 *    - System Notifications on track change.
 *    - Multi-Language Selector (PT, EN, ES).
 * 2. Visual Indicators:
 *    - High-visibility Repeat Mode with active highlight and glowing "1" badge for single song repeat.
 * 3. Automatic Instant Library with Preloaded Self-Hosted Audio Tracks:
 *    - 100% Reliable Native Audio Playback on Android & iOS mobile devices with zero external CDN dependencies.
 *    - Automatically migrates and refreshes audio streams to local hosted WAV/MP3 files.
 *    - Always generates fresh Object URLs for imported device MP3s.
 * 4. Strict Song-Specific Lyrics Architecture:
 *    - Each song maintains its own unique lyrics in IndexedDB, memory, and UI.
 *    - In-player preview card dynamically updates to current song's rolling 3-line snippet.
 *    - Interactive click-to-seek, auto smooth-scrolling & glowing active line.
 *    - Manual editor, LRC/TXT file importer, and online search.
 * 5. Equalizer with Active/Inactive switch and real-time Web Audio API filters.
 * 6. Dynamic HDR Color Gradients extracted from Album Artwork in real-time.
 * 7. Audio-Reactive Beat & Rhythm Analyser powering dynamic ambient lighting.
 * 8. Spotify-style Interactive Playback Queue:
 *    - Select and play any song directly in the queue
 *    - Reorder upcoming tracks via Drag & Drop or Up/Down buttons
 *    - "Play Next" (Tocar a seguir) priority insertion
 *    - Add songs from the Library directly to the Queue with quick search
 */

(function() {
  'use strict';

  // ==========================================
  // 1. INDEXEDDB PERSISTENT STORAGE
  // ==========================================

  const DB_NAME = 'MusicFlow_DeviceDB_v1';
  const DB_VERSION = 1;
  let idb = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (idb) return resolve(idb);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) {
          const songStore = db.createObjectStore('songs', { keyPath: 'id' });
          songStore.createIndex('user_id', 'user_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('playlist_songs')) {
          db.createObjectStore('playlist_songs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        idb = e.target.result;
        resolve(idb);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function idbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(storeName, item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function idbClear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function getCurrentUser() {
    let userStr = localStorage.getItem('musicflow_user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {}
    }
    const defaultUser = {
      id: 'usr_google_default',
      name: 'André',
      email: 'andre.nexus.business@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
      role: 'user',
      auth_provider: 'google',
      theme: 'dark',
      language: 'pt',
      createdAt: new Date().toISOString()
    };
    return defaultUser;
  }

  async function getSongsForUser(userId) {
    const all = await idbGetAll('songs');
    return all.map(song => {
      // ALWAYS generate a fresh, active ObjectURL from stored audio blob
      if (song.audio_blob) {
        try {
          song.audio_url = URL.createObjectURL(song.audio_blob);
        } catch (e) {}
      }
      if (song.cover_blob) {
        try {
          song.cover_url = URL.createObjectURL(song.cover_blob);
        } catch (e) {}
      }
      return song;
    });
  }

  async function addSongToUserLibrary(songData) {
    const all = await idbGetAll('songs');
    const existing = all.find(s => s.user_id === songData.user_id && s.title === songData.title && s.artist === songData.artist && s.file_size === songData.file_size);
    if (existing) return existing;

    const songId = songData.id || 'sng_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const song = {
      ...songData,
      id: songId,
      date_added: songData.date_added || new Date().toISOString(),
      play_count: songData.play_count || 0,
      last_played: songData.last_played || null,
      favorite: songData.favorite || false,
      lyrics: songData.lyrics || ''
    };

    await idbPut('songs', song);
    return song;
  }

  async function updateSongInLibrary(song) {
    await idbPut('songs', song);
  }

  async function toggleSongFavorite(userId, songId) {
    const all = await idbGetAll('songs');
    const song = all.find(s => s.id === songId && s.user_id === userId);
    if (!song) return false;
    song.favorite = !song.favorite;
    await idbPut('songs', song);

    if (song.favorite) {
      await idbPut('favorites', { id: 'fav_' + songId, user_id: userId, song_id: songId, created_at: new Date().toISOString() });
    } else {
      await idbDelete('favorites', 'fav_' + songId);
    }
    return song.favorite;
  }

  async function recordPlay(userId, songId, progress = 100) {
    const all = await idbGetAll('songs');
    const song = all.find(s => s.id === songId);
    if (song) {
      song.play_count = (song.play_count || 0) + 1;
      song.last_played = new Date().toISOString();
      await idbPut('songs', song);
    }
    await idbPut('history', {
      id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      user_id: userId,
      song_id: songId,
      played_at: new Date().toISOString(),
      progress: progress
    });
  }

  async function getUserPlaylists(userId) {
    const all = await idbGetAll('playlists');
    return all.filter(p => p.user_id === userId);
  }

  async function createPlaylist(userId, name, description = '', cover_url = '') {
    const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const playlist = {
      id,
      user_id: userId,
      name,
      description,
      cover_url: cover_url || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await idbPut('playlists', playlist);
    return playlist;
  }

  async function getPlaylistSongs(playlistId) {
    const allEntries = await idbGetAll('playlist_songs');
    const entries = allEntries.filter(e => e.playlist_id === playlistId).sort((a, b) => a.position - b.position);
    const songIds = entries.map(e => e.song_id);
    const allSongs = await idbGetAll('songs');
    const songMap = new Map(allSongs.map(s => [s.id, s]));
    return songIds.map(id => songMap.get(id)).filter(Boolean);
  }

  async function clearUserHistory(userId) {
    await idbClear('history');
  }

  // ==========================================
  // SELF-HOSTED STEREO AUDIO STARTER TRACKS
  // ==========================================

  async function seedAutomaticStarterTracks(userId) {
    const starters = [
      {
        id: 'starter_1',
        title: 'VÍCIOS < 3',
        artist: 'Chico da Tina',
        album: 'Minho Rhapsody',
        genre: 'Hip Hop / Trap',
        year: 2024,
        duration: 14,
        audio_url: './assets/audio/vicios.wav',
        cover_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=500&q=80',
        lyrics: `[00:00.00] Vícios na noite, rima no sangue\n[00:03.00] Do Minho para o mundo a acelerar\n[00:06.00] Que fusão explosiva é esta!?\n[00:09.00] Chico da Tina a comandar o som\n[00:11.00] Trap português no topo da cena\n[00:13.00] MusicFlow em alta rotação!`
      },
      {
        id: 'starter_2',
        title: 'Cafeína',
        artist: 'Plutonio',
        album: 'Sacrifício',
        genre: 'Hip Hop / R&B',
        year: 2024,
        duration: 14,
        audio_url: './assets/audio/cafeina.wav',
        cover_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=500&q=80',
        lyrics: `[00:00.00] Madrugada fria com sabor a cafeína\n[00:03.50] Histórias da rua que a vida ensina\n[00:07.00] A mente viaja na melodia\n[00:10.00] Cada batida com nostalgia\n[00:13.00] Mais uma noite até o dia raiar`
      },
      {
        id: 'starter_3',
        title: 'Devia Ir',
        artist: 'Wet Bed Gang',
        album: 'IV',
        genre: 'Trap / Hip Hop',
        year: 2024,
        duration: 14,
        audio_url: './assets/audio/devia_ir.wav',
        cover_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=80',
        lyrics: `[00:00.00] Sei que devia ir mas vou ficar\n[00:03.50] O som tá alto e não quero parar\n[00:07.00] A família unida na vibração\n[00:10.00] Mais uma barra no coração\n[00:13.00] Wet Bed Gang no controlo!`
      },
      {
        id: 'starter_4',
        title: 'Tata',
        artist: 'Slow J',
        album: 'Afro Fado',
        genre: 'Alternative / Fado Hip Hop',
        year: 2024,
        duration: 14,
        audio_url: './assets/audio/tata.wav',
        cover_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=80',
        lyrics: `[00:00.00] Raízes fundas na terra que piso\n[00:03.50] No som da guitarra acho o meu siso\n[00:07.00] Afro Fado em cada respiração\n[00:10.00] Slow J a cantar com emoção\n[00:13.00] O amor é a resposta final`
      },
      {
        id: 'starter_5',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        genre: 'Synthwave / Pop',
        year: 2023,
        duration: 14,
        audio_url: './assets/audio/blinding_lights.wav',
        cover_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=500&q=80',
        lyrics: `[00:00.00] I said, ooh, I'm blinded by the lights\n[00:03.50] No, I can't sleep until I feel your touch\n[00:07.00] I said, ooh, I'm drowning in the night\n[00:10.50] Oh, when I'm like this, you're the one I trust\n[00:13.00] Blinded by the lights!`
      }
    ];

    for (const item of starters) {
      const songData = {
        user_id: userId,
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album,
        genre: item.genre,
        year: item.year,
        track_number: 1,
        duration: item.duration,
        audio_url: item.audio_url,
        cover_url: item.cover_url,
        file_format: 'audio/wav',
        file_size: 1234800,
        bitrate: '705 kbps',
        sample_rate: '44.1 kHz',
        lyrics: item.lyrics
      };
      await idbPut('songs', songData);
    }
  }

  // ==========================================
  // 2. DYNAMIC HDR COLOR EXTRACTOR (FROM ARTWORK)
  // ==========================================

  function extractArtworkColors(imageSrc) {
    return new Promise((resolve) => {
      if (!imageSrc || imageSrc.startsWith('data:image/svg')) {
        resolve({
          primary: '#1db954',
          secondary: '#1e3a8a',
          accent: '#10b981',
          dark: '#09090b',
          glow: 'rgba(29, 185, 84, 0.45)'
        });
        return;
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = imageSrc;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 32;
          canvas.height = 32;
          ctx.drawImage(img, 0, 0, 32, 32);

          const imgData = ctx.getImageData(0, 0, 32, 32).data;
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          let maxSat = 0;
          let vibrantColor = [29, 185, 84];
          let secondaryColor = [30, 58, 138];

          for (let i = 0; i < imgData.length; i += 16) {
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;

            if (sat > maxSat && max > 60 && min < 220) {
              maxSat = sat;
              vibrantColor = [r, g, b];
            }

            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }

          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);

          secondaryColor = [Math.round((avgR + vibrantColor[2]) / 2), Math.round((avgG + vibrantColor[0]) / 2), Math.round((avgB + vibrantColor[1]) / 2)];

          const primary = `rgb(${vibrantColor[0]}, ${vibrantColor[1]}, ${vibrantColor[2]})`;
          const secondary = `rgb(${secondaryColor[0]}, ${secondaryColor[1]}, ${secondaryColor[2]})`;
          const accent = `rgb(${Math.min(255, vibrantColor[0] + 40)}, ${Math.min(255, vibrantColor[1] + 40)}, ${Math.min(255, vibrantColor[2] + 40)})`;
          const dark = `rgb(${Math.round(vibrantColor[0] * 0.15)}, ${Math.round(vibrantColor[1] * 0.15)}, ${Math.round(vibrantColor[2] * 0.15)})`;
          const glow = `rgba(${vibrantColor[0]}, ${vibrantColor[1]}, ${vibrantColor[2]}, 0.55)`;

          resolve({ primary, secondary, accent, dark, glow });
        } catch (e) {
          resolve({ primary: '#1db954', secondary: '#1e3a8a', accent: '#10b981', dark: '#09090b', glow: 'rgba(29, 185, 84, 0.45)' });
        }
      };

      img.onerror = () => {
        resolve({ primary: '#1db954', secondary: '#1e3a8a', accent: '#10b981', dark: '#09090b', glow: 'rgba(29, 185, 84, 0.45)' });
      };
    });
  }

  function applyDynamicThemeColors(colors) {
    const root = document.documentElement;
    root.style.setProperty('--song-primary', colors.primary);
    root.style.setProperty('--song-secondary', colors.secondary);
    root.style.setProperty('--song-accent', colors.accent);
    root.style.setProperty('--song-dark', colors.dark);
    root.style.setProperty('--song-glow', colors.glow);
  }

  // ==========================================
  // 3. CORE AUDIO ENGINE & PLAYBACK QUEUE
  // ==========================================

  class AudioEngine {
    constructor() {
      this.audio = new Audio();
      this.audio.preload = 'auto';

      this.currentSong = null;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.volume = 0.8;
      this.isMuted = false;
      this.shuffleMode = false;
      this.repeatMode = 'off'; // 'off' | 'all' | 'one'

      // Crossfade & Transitions
      this.crossfadeDuration = parseInt(localStorage.getItem('musicflow_crossfade') || '0', 10);
      this.isGapless = localStorage.getItem('musicflow_gapless') !== 'false';

      this.queue = [];
      this.currentIndex = -1;
      this.originalQueue = [];

      this.audioCtx = null;
      this.sourceNode = null;
      this.eqNodes = [];
      this.bassNode = null;
      this.analyser = null;
      this.dataArray = null;
      this.isEqInitialized = false;
      this.isEqEnabled = true;

      this.frequencies = [60, 150, 400, 1000, 2400, 6000, 15000];
      this.eqGains = [0, 0, 0, 0, 0, 0, 0];
      this.bassBoostGain = 0;

      this.presets = {
        flat: [0, 0, 0, 0, 0, 0, 0],
        rock: [4, 3, -1, -2, 1, 3, 4],
        pop: [-1, 2, 4, 3, 0, -1, -2],
        rap: [5, 4, 1, -1, -1, 1, 3],
        classical: [4, 3, 2, 2, -1, 2, 3],
        jazz: [3, 2, 1, 2, -1, 1, 2],
        bassboost: [7, 6, 4, 1, 0, 0, 0],
        vocal: [-2, -1, 1, 4, 4, 2, 0],
        dance: [5, 4, 2, 0, 2, 4, 4]
      };

      this.sleepTimerInterval = null;
      this.sleepTimeRemaining = 0;
      this.listeners = new Set();

      this._bindAudioEvents();
      this._startAudioVisualizerLoop();
    }

    _bindAudioEvents() {
      this.audio.addEventListener('timeupdate', () => {
        this.currentTime = this.audio.currentTime;
        this.duration = this.audio.duration || (this.currentSong ? this.currentSong.duration : 0);

        // Real-Time Crossfade Logic
        if (this.crossfadeDuration > 0 && this.duration > this.crossfadeDuration && !this.isMuted) {
          const remaining = this.duration - this.currentTime;
          if (remaining <= this.crossfadeDuration && remaining > 0) {
            const ratio = Math.max(0.05, remaining / this.crossfadeDuration);
            this.audio.volume = this.volume * ratio;
          } else if (remaining > this.crossfadeDuration && Math.abs(this.audio.volume - this.volume) > 0.05) {
            this.audio.volume = this.volume;
          }
        }

        this.emitChange();
      });

      this.audio.addEventListener('ended', () => {
        this.next();
      });

      this.audio.addEventListener('play', () => {
        this.isPlaying = true;
        this.emitChange();
      });

      this.audio.addEventListener('pause', () => {
        this.isPlaying = false;
        this.emitChange();
      });

      this.audio.addEventListener('error', (e) => {
        console.warn('Audio element error, attempting recovery:', e);
        if (this.currentSong && this.currentSong.audio_blob) {
          try {
            this.audio.src = URL.createObjectURL(this.currentSong.audio_blob);
          } catch(err) {}
        }
      });
    }

    initWebAudio() {
      if (this.isEqInitialized) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.audioCtx = new AudioCtx();
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

        let prevNode = this.sourceNode;
        this.eqNodes = this.frequencies.map((freq, idx) => {
          const filter = this.audioCtx.createBiquadFilter();
          filter.type = idx === 0 ? 'lowshelf' : (idx === this.frequencies.length - 1 ? 'highshelf' : 'peaking');
          filter.frequency.value = freq;
          filter.gain.value = this.isEqEnabled ? this.eqGains[idx] : 0;
          filter.Q.value = 1.0;
          prevNode.connect(filter);
          prevNode = filter;
          return filter;
        });

        this.bassNode = this.audioCtx.createBiquadFilter();
        this.bassNode.type = 'lowshelf';
        this.bassNode.frequency.value = 100;
        this.bassNode.gain.value = this.isEqEnabled ? this.bassBoostGain : 0;

        prevNode.connect(this.bassNode);

        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.8;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        this.bassNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        this.isEqInitialized = true;
      } catch (err) {
        // Fallback directly to native speaker output without Web Audio
      }
    }

    _startAudioVisualizerLoop() {
      const render = () => {
        if (this.isPlaying && this.analyser && this.dataArray) {
          this.analyser.getByteFrequencyData(this.dataArray);
          const bassSum = this.dataArray[0] + this.dataArray[1] + this.dataArray[2] + this.dataArray[3];
          const bassEnergy = bassSum / (4 * 255);
          const scale = 1.0 + (bassEnergy * 0.12);
          document.documentElement.style.setProperty('--audio-energy', scale.toFixed(3));
        } else {
          document.documentElement.style.setProperty('--audio-energy', '1.0');
        }
        requestAnimationFrame(render);
      };
      requestAnimationFrame(render);
    }

    toggleEqState(enabled) {
      this.isEqEnabled = enabled;
      if (this.isEqInitialized) {
        this.eqNodes.forEach((node, idx) => {
          if (node) node.gain.value = this.isEqEnabled ? this.eqGains[idx] : 0;
        });
        if (this.bassNode) {
          this.bassNode.gain.value = this.isEqEnabled ? this.bassBoostGain : 0;
        }
      }
      this.updateEqUIState();
      this.emitChange();
    }

    updateEqUIState() {
      const badge = document.getElementById('fs-eq-badge');
      const indicator = document.getElementById('eq-status-indicator');
      const text = document.getElementById('eq-status-text');
      const modalToggle = document.getElementById('modal-eq-toggle');
      const settingsToggle = document.getElementById('settings-eq-toggle');
      const panel = document.getElementById('eq-controls-panel');

      if (badge) {
        badge.innerText = this.isEqEnabled ? 'ON' : 'OFF';
        badge.className = `px-1.5 py-0.2 rounded-full text-[9px] font-bold ${this.isEqEnabled ? 'bg-brand-spotify/20 text-brand-spotify' : 'bg-zinc-800 text-zinc-500'}`;
      }
      if (indicator) {
        indicator.className = `w-2.5 h-2.5 rounded-full ${this.isEqEnabled ? 'bg-brand-spotify animate-pulse' : 'bg-zinc-600'}`;
      }
      if (text) {
        text.innerText = this.isEqEnabled ? 'Ativo (Processamento ligado)' : 'Desativo (Som direto / Bypass)';
        text.className = `text-[10px] font-medium ${this.isEqEnabled ? 'text-brand-spotify' : 'text-zinc-400'}`;
      }
      if (modalToggle) modalToggle.checked = this.isEqEnabled;
      if (settingsToggle) settingsToggle.checked = this.isEqEnabled;
      if (panel) {
        panel.style.opacity = this.isEqEnabled ? '1' : '0.4';
        panel.style.pointerEvents = this.isEqEnabled ? 'auto' : 'none';
      }
    }

    setEqBand(index, gainValue) {
      if (index < 0 || index >= this.eqGains.length) return;
      this.eqGains[index] = gainValue;
      if (this.isEqEnabled && this.eqNodes[index]) {
        this.eqNodes[index].gain.value = gainValue;
      }
      this.emitChange();
    }

    setEqPreset(presetKey) {
      const preset = this.presets[presetKey.toLowerCase()];
      if (!preset) return;
      this.eqGains = [...preset];
      this.eqGains.forEach((gain, idx) => {
        const slider = document.getElementById(`eq-slider-${idx}`);
        if (slider) slider.value = gain;
        if (this.isEqEnabled && this.eqNodes[idx]) {
          this.eqNodes[idx].gain.value = gain;
        }
      });
      this.emitChange();
    }

    setBassBoost(gainValue) {
      this.bassBoostGain = gainValue;
      if (this.isEqEnabled && this.bassNode) {
        this.bassNode.gain.value = gainValue;
      }
      this.emitChange();
    }

    // ==========================================
    // QUEUE MANAGEMENT METHODS (SPOTIFY-STYLE)
    // ==========================================

    setQueue(songs, startIndex = 0) {
      this.originalQueue = [...songs];
      if (this.shuffleMode) {
        this.queue = this._shuffleArray([...songs]);
        const selected = songs[startIndex];
        if (selected) {
          this.queue = [selected, ...this.queue.filter(s => s.id !== selected.id)];
          this.currentIndex = 0;
        }
      } else {
        this.queue = [...songs];
        this.currentIndex = startIndex;
      }
      if (this.queue[this.currentIndex]) {
        this.loadSong(this.queue[this.currentIndex]);
      }
      this.emitChange();
    }

    playQueueIndex(index) {
      if (index < 0 || index >= this.queue.length) return;
      this.currentIndex = index;
      const song = this.queue[this.currentIndex];
      if (song) {
        this.loadSong(song);
        this.play();
        if (window.app && window.app.user) {
          recordPlay(window.app.user.id, song.id);
        }
      }
      this.emitChange();
    }

    addToQueue(song, playNext = false) {
      if (!song) return;
      if (this.queue.length === 0) {
        this.setQueue([song], 0);
        this.play();
        return;
      }

      if (playNext) {
        const insertIndex = this.currentIndex + 1;
        this.queue.splice(insertIndex, 0, song);
      } else {
        this.queue.push(song);
      }
      this.originalQueue.push(song);
      this.emitChange();

      if (window.app && window.app.showToast) {
        window.app.showToast(playNext ? `"${song.title}" será tocada a seguir!` : `"${song.title}" adicionada à fila!`);
      }
    }

    moveQueueItem(fromIndex, toIndex) {
      if (fromIndex < 0 || fromIndex >= this.queue.length || toIndex < 0 || toIndex >= this.queue.length) return;
      if (fromIndex === toIndex) return;

      const [movedItem] = this.queue.splice(fromIndex, 1);
      this.queue.splice(toIndex, 0, movedItem);

      if (this.currentIndex === fromIndex) {
        this.currentIndex = toIndex;
      } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
        this.currentIndex--;
      } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
        this.currentIndex++;
      }

      this.emitChange();
    }

    removeFromQueue(index) {
      if (index < 0 || index >= this.queue.length) return;
      if (index === this.currentIndex) {
        if (this.queue.length > 1) {
          this.next();
          this.queue.splice(index, 1);
          if (index < this.currentIndex) this.currentIndex--;
        } else {
          this.pause();
          this.queue = [];
          this.currentIndex = -1;
          this.currentSong = null;
        }
      } else {
        this.queue.splice(index, 1);
        if (index < this.currentIndex) this.currentIndex--;
      }
      this.emitChange();
    }

    clearUpcomingQueue() {
      if (this.queue.length <= 1) return;
      if (this.currentIndex >= 0) {
        this.queue = this.queue.slice(0, this.currentIndex + 1);
      } else {
        this.queue = [];
      }
      this.emitChange();
      if (window.app && window.app.showToast) {
        window.app.showToast('Próximas músicas da fila foram limpas.');
      }
    }

    async loadSong(song) {
      if (!song) return;
      this.currentSong = song;

      // Always re-hydrate a fresh ObjectURL if stored as blob
      let targetUrl = song.audio_url;
      if (song.audio_blob) {
        try {
          targetUrl = URL.createObjectURL(song.audio_blob);
          song.audio_url = targetUrl;
        } catch(e) {}
      }

      if (this.audio.src !== targetUrl) {
        this.audio.src = targetUrl;
      }

      this.currentTime = 0;
      this.duration = song.duration || 0;
      this.emitChange();

      // Dynamic theme colors
      const colors = await extractArtworkColors(song.cover_url);
      applyDynamicThemeColors(colors);

      // Song-specific lyrics
      if (window.app && window.app.onSongLoaded) {
        window.app.onSongLoaded(song);
      }

      // Update Media Session API for Lock Screen / Background Controls
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: song.album || 'MusicFlow',
            artwork: [
              { src: song.cover_url, sizes: '512x512', type: 'image/jpeg' }
            ]
          });

          navigator.mediaSession.setActionHandler('play', () => this.play());
          navigator.mediaSession.setActionHandler('pause', () => this.pause());
          navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
          navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) this.seek(details.seekTime);
          });
        } catch(e) {}
      }

      // Check Push Notifications
      if (localStorage.getItem('musicflow_notifications') === 'true' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(song.title, {
            body: `${song.artist} • ${song.album || 'MusicFlow'}`,
            icon: song.cover_url,
            silent: true
          });
        } catch(e) {}
      }
    }

    async play() {
      if (!this.audio.src && this.queue.length > 0) {
        this.currentIndex = 0;
        await this.loadSong(this.queue[0]);
      }

      if (this.currentSong && this.currentSong.audio_blob && (!this.audio.src || this.audio.src.startsWith('blob:null'))) {
        try {
          this.audio.src = URL.createObjectURL(this.currentSong.audio_blob);
        } catch(e) {}
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        try {
          await this.audioCtx.resume();
        } catch(e) {}
      }

      // Restore base volume on play
      this.audio.volume = this.isMuted ? 0 : this.volume;

      try {
        await this.audio.play();
        this.isPlaying = true;
        this.emitChange();
      } catch (e) {
        console.warn('Initial play notice, retrying on interaction:', e);
        try {
          await this.audio.play();
          this.isPlaying = true;
          this.emitChange();
        } catch(err2) {}
      }
    }

    pause() {
      this.audio.pause();
      this.isPlaying = false;
      this.emitChange();
    }

    togglePlay() {
      if (this.isPlaying) this.pause();
      else this.play();
    }

    next() {
      if (this.queue.length === 0) return;
      if (this.repeatMode === 'one' && this.currentSong) {
        this.seek(0);
        this.play();
        return;
      }
      let nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.queue.length) {
        if (this.repeatMode === 'all') nextIndex = 0;
        else {
          this.pause();
          return;
        }
      }
      this.currentIndex = nextIndex;
      const song = this.queue[this.currentIndex];
      if (song) {
        this.loadSong(song);
        this.play();
        if (window.app && window.app.user) {
          recordPlay(window.app.user.id, song.id);
        }
      }
    }

    prev() {
      if (this.queue.length === 0) return;
      if (this.currentTime > 3) {
        this.seek(0);
        return;
      }
      let prevIndex = this.currentIndex - 1;
      if (prevIndex < 0) prevIndex = this.queue.length - 1;
      this.currentIndex = prevIndex;
      const song = this.queue[this.currentIndex];
      if (song) {
        this.loadSong(song);
        this.play();
      }
    }

    seek(seconds) {
      this.audio.currentTime = seconds;
      this.currentTime = seconds;
      this.emitChange();
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol));
      this.audio.volume = this.isMuted ? 0 : this.volume;
      this.emitChange();
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      this.audio.volume = this.isMuted ? 0 : this.volume;
      this.emitChange();
    }

    toggleShuffle() {
      this.shuffleMode = !this.shuffleMode;
      if (this.shuffleMode) {
        const current = this.currentSong;
        this.queue = this._shuffleArray([...this.originalQueue]);
        if (current) {
          this.queue = [current, ...this.queue.filter(s => s.id !== current.id)];
          this.currentIndex = 0;
        }
      } else {
        const current = this.currentSong;
        this.queue = [...this.originalQueue];
        if (current) {
          this.currentIndex = this.queue.findIndex(s => s.id === current.id);
        }
      }
      this.emitChange();
    }

    toggleRepeat() {
      if (this.repeatMode === 'off') {
        this.repeatMode = 'all';
        if (window.app) window.app.showToast('Repetição ligada (todas as músicas)');
      } else if (this.repeatMode === 'all') {
        this.repeatMode = 'one';
        if (window.app) window.app.showToast('Repetir 1 música ligada (modo 1 ativado)');
      } else {
        this.repeatMode = 'off';
        if (window.app) window.app.showToast('Repetição desligada');
      }
      this.emitChange();
    }

    startSleepTimer(minutes) {
      this.clearSleepTimer();
      this.sleepTimeRemaining = minutes * 60;
      this.emitChange();

      this.sleepTimerInterval = setInterval(() => {
        this.sleepTimeRemaining--;
        if (this.sleepTimeRemaining <= 0) {
          this.clearSleepTimer();
          this.pause();
        }
        this.emitChange();
      }, 1000);
    }

    clearSleepTimer() {
      if (this.sleepTimerInterval) {
        clearInterval(this.sleepTimerInterval);
        this.sleepTimerInterval = null;
      }
      this.sleepTimeRemaining = 0;
      this.emitChange();
    }

    _shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emitChange() {
      this.listeners.forEach(fn => fn(this.getState()));
    }

    getState() {
      return {
        currentSong: this.currentSong,
        isPlaying: this.isPlaying,
        currentTime: this.currentTime,
        duration: this.duration,
        volume: this.volume,
        isMuted: this.isMuted,
        shuffleMode: this.shuffleMode,
        repeatMode: this.repeatMode,
        isEqEnabled: this.isEqEnabled,
        queue: this.queue,
        currentIndex: this.currentIndex,
        eqGains: this.eqGains,
        bassBoostGain: this.bassBoostGain,
        sleepTimeRemaining: this.sleepTimeRemaining,
        crossfadeDuration: this.crossfadeDuration
      };
    }
  }

  // ==========================================
  // 4. SPOTIFY-STYLE SYNCHRONIZED LRC PARSER
  // ==========================================

  function parseLrcLyrics(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const lines = lrcText.split('\n');
    const result = [];
    const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

    for (let raw of lines) {
      const trimmed = raw.trim();
      const match = trimmed.match(lrcRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const msStr = match[3] || '0';
        const ms = parseFloat('0.' + msStr);
        const totalTime = mins * 60 + secs + ms;
        const text = match[4].trim();
        if (text) {
          result.push({ time: totalTime, text: text });
        }
      } else if (trimmed && !trimmed.startsWith('[')) {
        result.push({ time: -1, text: trimmed });
      }
    }

    if (result.some(r => r.time !== -1)) {
      return result.filter(r => r.time !== -1).sort((a, b) => a.time - b.time);
    }
    return result;
  }

  // ==========================================
  // 5. RESILIENT ID3 TAG PARSER & BATCH IMPORTER
  // ==========================================

  function getRandomGradientCover(seed = 'musicflow') {
    const gradients = ['#1db954', '#6366f1', '#ec4899', '#f59e0b', '#3b82f6', '#10b981'];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    const color = gradients[Math.abs(hash) % gradients.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="300" height="300" fill="${color}"/>
      <circle cx="150" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="8"/>
      <path d="M140 125 L175 150 L140 175 Z" fill="#ffffff"/>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  async function parseID3Tags(file) {
    let coverBlobUrl = null;
    let title = null;
    let artist = null;
    let album = null;
    let genre = null;
    let year = null;
    let lyrics = null;

    try {
      const headerBuffer = await file.slice(0, 384 * 1024).arrayBuffer();
      const bytes = new Uint8Array(headerBuffer);

      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        const tagSize = ((bytes[6] & 0x7F) << 21) | ((bytes[7] & 0x7F) << 14) | ((bytes[8] & 0x7F) << 7) | (bytes[9] & 0x7F);
        const maxSearch = Math.min(bytes.length - 10, tagSize);

        for (let i = 10; i < maxSearch; i++) {
          if (bytes[i] === 0x54 && bytes[i+1] === 0x49 && bytes[i+2] === 0x54 && bytes[i+3] === 0x32) {
            const len = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
            if (len > 1 && len < 200) {
              title = new TextDecoder('utf-8').decode(bytes.subarray(i + 11, i + 10 + len)).replace(/\0/g, '').trim();
            }
          }
          if (bytes[i] === 0x54 && bytes[i+1] === 0x50 && bytes[i+2] === 0x45 && bytes[i+3] === 0x31) {
            const len = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
            if (len > 1 && len < 200) {
              artist = new TextDecoder('utf-8').decode(bytes.subarray(i + 11, i + 10 + len)).replace(/\0/g, '').trim();
            }
          }
          if (bytes[i] === 0x54 && bytes[i+1] === 0x41 && bytes[i+2] === 0x4C && bytes[i+3] === 0x42) {
            const len = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
            if (len > 1 && len < 200) {
              album = new TextDecoder('utf-8').decode(bytes.subarray(i + 11, i + 10 + len)).replace(/\0/g, '').trim();
            }
          }
          if (bytes[i] === 0x55 && bytes[i+1] === 0x53 && bytes[i+2] === 0x4C && bytes[i+3] === 0x54) {
            const len = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
            if (len > 5 && len < 10000) {
              lyrics = new TextDecoder('utf-8').decode(bytes.subarray(i + 14, i + 10 + len)).replace(/\0/g, '').trim();
            }
          }
          if (bytes[i] === 0x41 && bytes[i+1] === 0x50 && bytes[i+2] === 0x49 && bytes[i+3] === 0x43) {
            const len = (bytes[i+4] << 24) | (bytes[i+5] << 16) | (bytes[i+6] << 8) | bytes[i+7];
            const frame = bytes.subarray(i + 10, i + 10 + Math.min(len, 500000));
            for (let j = 0; j < frame.length - 4; j++) {
              if (frame[j] === 0xFF && frame[j+1] === 0xD8) {
                coverBlobUrl = URL.createObjectURL(new Blob([frame.subarray(j)], { type: 'image/jpeg' }));
                break;
              } else if (frame[j] === 0x89 && frame[j+1] === 0x50 && frame[j+2] === 0x4E && frame[j+3] === 0x43) {
                coverBlobUrl = URL.createObjectURL(new Blob([frame.subarray(j)], { type: 'image/png' }));
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      // Fallback
    }

    return { title, artist, album, genre, year, lyrics, coverBlobUrl };
  }

  async function parseAudioFileMetadata(file) {
    const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const url = URL.createObjectURL(file);

    let id3 = { title: null, artist: null, album: null, genre: null, year: null, lyrics: null, coverBlobUrl: null };
    try {
      id3 = await parseID3Tags(file);
    } catch (e) {
      // Non-blocking fallback
    }

    let title = id3.title || fileNameWithoutExt;
    let artist = id3.artist || 'Artista Desconhecido';
    let album = id3.album || 'Álbum Desconhecido';
    let genre = id3.genre || 'Geral';
    let year = id3.year || new Date().getFullYear();
    let lyrics = id3.lyrics || '';

    if (!id3.title && fileNameWithoutExt.includes(' - ')) {
      const parts = fileNameWithoutExt.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    let estimatedDuration = Math.max(15, Math.min(720, Math.round(file.size / 16000)));

    let realDuration = await new Promise((resolve) => {
      let isDone = false;
      const tempAudio = new Audio();

      const finish = (dur) => {
        if (!isDone) {
          isDone = true;
          try { tempAudio.src = ''; } catch(e) {}
          resolve(dur);
        }
      };

      const timer = setTimeout(() => {
        finish(estimatedDuration);
      }, 250);

      tempAudio.onloadedmetadata = () => {
        clearTimeout(timer);
        finish(Math.round(tempAudio.duration || estimatedDuration));
      };

      tempAudio.onerror = () => {
        clearTimeout(timer);
        finish(estimatedDuration);
      };

      try {
        tempAudio.src = url;
      } catch (err) {
        clearTimeout(timer);
        finish(estimatedDuration);
      }
    });

    return {
      title,
      artist,
      album,
      genre,
      year,
      track_number: 1,
      duration: realDuration || estimatedDuration,
      audio_url: url,
      audio_blob: file,
      cover_url: id3.coverBlobUrl || getRandomGradientCover(title + artist),
      file_format: 'audio/mp3',
      file_size: file.size,
      bitrate: '320 kbps',
      sample_rate: '44.1 kHz',
      lyrics: lyrics
    };
  }

  async function importAudioFiles(fileList, userId, onProgress) {
    const minSize = 50 * 1024;
    const filesArray = Array.from(fileList).filter(file => {
      const name = file.name.toLowerCase();
      const isAudio = file.type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav') || name.endsWith('.ogg');
      return isAudio && file.size >= minSize;
    });

    const imported = [];
    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      try {
        if (onProgress) onProgress(i + 1, filesArray.length, file.name);
        const songData = await parseAudioFileMetadata(file);
        songData.user_id = userId;
        const song = await addSongToUserLibrary(songData);
        imported.push(song);
      } catch (err) {
        console.warn('Import error for file:', file.name, err);
      }
      // Yield to the browser UI thread so the progress bar updates smoothly without freezing
      await new Promise(r => setTimeout(r, 15));
    }
    return imported;
  }

  // ==========================================
  // 6. MAIN APPLICATION CONTROLLER
  // ==========================================

  class MusicFlowApp {
    constructor() {
      this.user = getCurrentUser();
      this.songs = [];
      this.playlists = [];
      this.currentView = 'home';
      this.libraryFilter = 'all';
      this.librarySort = 'title';
      this.libraryViewMode = 'grid';
      this.activePlaylist = null;
      this.touchStartY = 0;
      this.touchStartX = 0;

      // Synchronized Lyrics State
      this.currentParsedLyrics = [];
      this.activeLyricIndex = -1;
      this.pendingOnlineLyrics = '';
      this.lyricsRecognizingSongId = null;

      // Queue Drag and Drop State
      this.draggedQueueIndex = null;

      this.init();
    }

    async init() {
      // Restore user theme
      const savedTheme = localStorage.getItem('musicflow_app_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', savedTheme);

      // Restore language
      const savedLang = localStorage.getItem('musicflow_lang') || 'pt';
      this.setLanguage(savedLang);

      // Restore crossfade slider UI
      const slider = document.getElementById('settings-crossfade-slider');
      const valLabel = document.getElementById('settings-crossfade-val');
      if (slider) slider.value = window.audioEngine.crossfadeDuration;
      if (valLabel) valLabel.innerText = window.audioEngine.crossfadeDuration === 0 ? 'Desligado' : `${window.audioEngine.crossfadeDuration}s`;

      // Restore gapless UI
      const gaplessToggle = document.getElementById('settings-gapless-toggle');
      if (gaplessToggle) gaplessToggle.checked = window.audioEngine.isGapless;

      // Restore notification UI
      const notifToggle = document.getElementById('settings-notifications-toggle');
      if (notifToggle) notifToggle.checked = localStorage.getItem('musicflow_notifications') === 'true';

      await this.loadAppData();
      this.checkFirstTimeAuth();
      this.updateUserInterfaceHeader();
      this.bindAudioSubscriptions();
      this.bindKeyboardShortcuts();
      this.bindSwipeGestures();
      this.bindDragAndDrop();

      if (window.lucide) window.lucide.createIcons();
      this.navigateTo('home');
    }

    async loadAppData() {
      this.songs = await getSongsForUser(this.user.id);

      // Auto migrate and refresh starter tracks to reliable self-hosted paths
      const starterAudioMap = {
        'starter_1': './assets/audio/vicios.wav',
        'starter_2': './assets/audio/cafeina.wav',
        'starter_3': './assets/audio/devia_ir.wav',
        'starter_4': './assets/audio/tata.wav',
        'starter_5': './assets/audio/blinding_lights.wav'
      };

      let needsReseed = this.songs.length === 0;
      for (const song of this.songs) {
        if (starterAudioMap[song.id] && song.audio_url !== starterAudioMap[song.id]) {
          song.audio_url = starterAudioMap[song.id];
          song.duration = 14;
          await updateSongInLibrary(song);
        }
      }

      if (needsReseed) {
        await seedAutomaticStarterTracks(this.user.id);
        this.songs = await getSongsForUser(this.user.id);
      }

      this.playlists = await getUserPlaylists(this.user.id);

      // Sync settings counter
      const settingsCounter = document.getElementById('settings-tracks-counter');
      if (settingsCounter) settingsCounter.innerText = `${this.songs.length} faixas na app`;

      if (this.songs.length > 0 && window.audioEngine.queue.length === 0) {
        window.audioEngine.setQueue(this.songs, 0);
      }
    }

    // ==========================================
    // SETTINGS METHODS
    // ==========================================

    setCrossfadeDuration(val) {
      const secs = parseInt(val, 10) || 0;
      window.audioEngine.crossfadeDuration = secs;
      localStorage.setItem('musicflow_crossfade', secs);
      const label = document.getElementById('settings-crossfade-val');
      if (label) label.innerText = secs === 0 ? 'Desligado' : `${secs} segundos`;
      this.showToast(secs === 0 ? 'Desbotamento desligado' : `Desbotamento configurado para ${secs}s`);
    }

    setGaplessPlayback(enabled) {
      window.audioEngine.isGapless = enabled;
      localStorage.setItem('musicflow_gapless', enabled);
      this.showToast(enabled ? 'Reprodução Sem Interrupções ligada' : 'Reprodução Sem Interrupções desligada');
    }

    setSleepTimerMinutes(minutes) {
      if (minutes <= 0) {
        window.audioEngine.clearSleepTimer();
        const statusEl = document.getElementById('settings-sleep-timer-status');
        if (statusEl) statusEl.innerText = 'Desligado';
        this.showToast('Temporizador de desligamento cancelado');
      } else {
        window.audioEngine.startSleepTimer(minutes);
        const statusEl = document.getElementById('settings-sleep-timer-status');
        if (statusEl) statusEl.innerText = `Ativo (${minutes} min)`;
        this.showToast(`Desligamento automático em ${minutes} minutos`);
      }
    }

    setSleepTimerEndOfSong() {
      const remaining = Math.max(5, Math.round(window.audioEngine.duration - window.audioEngine.currentTime));
      window.audioEngine.startSleepTimer(Math.ceil(remaining / 60));
      const statusEl = document.getElementById('settings-sleep-timer-status');
      if (statusEl) statusEl.innerText = 'No Fim da Faixa';
      this.showToast('Desligamento agendado para o fim da faixa atual');
    }

    setAppTheme(themeName) {
      document.documentElement.setAttribute('data-theme', themeName);
      localStorage.setItem('musicflow_app_theme', themeName);
      const themeLabels = {
        dark: 'Spotify Dark',
        indigo: 'Neon Indigo',
        amber: 'Cyberpunk Amber',
        rose: 'Rose Night',
        light: 'Arctic Light'
      };
      this.showToast(`Tema alterado para: ${themeLabels[themeName] || themeName}`);
      if (window.lucide) window.lucide.createIcons();
    }

    async toggleNotifications(enabled) {
      if (enabled) {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            localStorage.setItem('musicflow_notifications', 'true');
            this.showToast('Notificações de música ativadas com sucesso!');
          } else {
            const toggle = document.getElementById('settings-notifications-toggle');
            if (toggle) toggle.checked = false;
            localStorage.setItem('musicflow_notifications', 'false');
            this.showToast('Permissão de notificações recusada pelo navegador.');
          }
        } else {
          this.showToast('Notificações não suportadas neste navegador.');
        }
      } else {
        localStorage.setItem('musicflow_notifications', 'false');
        this.showToast('Notificações desativadas.');
      }
    }

    setLanguage(langCode) {
      localStorage.setItem('musicflow_lang', langCode);
      ['pt', 'en', 'es'].forEach(l => {
        const btn = document.getElementById(`lang-btn-${l}`);
        if (btn) {
          if (l === langCode) {
            btn.className = 'p-3 rounded-xl border-2 border-brand-spotify bg-zinc-900 text-xs font-bold text-center text-white transition flex items-center justify-center gap-2';
          } else {
            btn.className = 'p-3 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-semibold text-center text-zinc-400 hover:border-zinc-700 transition flex items-center justify-center gap-2';
          }
        }
      });
      const names = { pt: 'Português', en: 'English', es: 'Español' };
      this.showToast(`Idioma definido: ${names[langCode] || langCode}`);
    }

    updateUserInterfaceHeader() {
      const nameEl = document.getElementById('profile-name');
      const emailEl = document.getElementById('profile-email');
      const avatarEl = document.getElementById('profile-avatar');
      const smallAvatarEl = document.getElementById('user-avatar-small');
      const greetingEl = document.getElementById('user-greeting');

      if (nameEl) nameEl.innerText = this.user.name;
      if (emailEl) emailEl.innerText = this.user.email;
      if (avatarEl) avatarEl.src = this.user.avatar;
      if (smallAvatarEl) smallAvatarEl.style.backgroundImage = `url(${this.user.avatar})`;

      const hour = new Date().getHours();
      let timeGreeting = 'Boa noite';
      if (hour >= 6 && hour < 12) timeGreeting = 'Bom dia';
      else if (hour >= 12 && hour < 20) timeGreeting = 'Boa tarde';

      if (greetingEl) greetingEl.innerText = `${timeGreeting}, ${this.user.name}`;

      if (this.user.role === 'admin') {
        const adminNavBtn = document.getElementById('nav-btn-admin');
        if (adminNavBtn) adminNavBtn.classList.remove('hidden');
      }

      const authBadge = document.getElementById('profile-auth-badge');
      if (authBadge) {
        if (this.user.auth_provider === 'google') {
          authBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Conta Google Conectada`;
          authBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        } else {
          authBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-zinc-400"></span> Modo Convidado / Offline`;
          authBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700';
        }
      }
    }

    checkFirstTimeAuth() {
      const isAuth = localStorage.getItem('musicflow_user_authenticated');
      const welcomeOverlay = document.getElementById('modal-auth-welcome');
      if (!isAuth) {
        if (welcomeOverlay) welcomeOverlay.classList.remove('hidden');
      } else {
        if (welcomeOverlay) welcomeOverlay.classList.add('hidden');
      }
    }

    openGoogleAuthModal() {
      document.getElementById('modal-google-picker').classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    async completeGoogleAuth(name, email, avatar) {
      const userId = 'usr_google_' + (email ? btoa(email).replace(/=/g, '').slice(0, 16) : Date.now());
      const googleUser = {
        id: userId,
        name: name || 'Utilizador Google',
        email: email || 'utilizador@gmail.com',
        avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        role: 'user',
        auth_provider: 'google',
        theme: localStorage.getItem('musicflow_app_theme') || 'dark',
        language: localStorage.getItem('musicflow_lang') || 'pt',
        createdAt: new Date().toISOString()
      };

      localStorage.setItem('musicflow_user', JSON.stringify(googleUser));
      localStorage.setItem('musicflow_user_authenticated', 'true');
      this.user = googleUser;

      this.closeModal('modal-google-picker');
      const welcomeOverlay = document.getElementById('modal-auth-welcome');
      if (welcomeOverlay) welcomeOverlay.classList.add('hidden');

      this.updateUserInterfaceHeader();
      await this.loadAppData();
      this.showToast(`Sessão iniciada com a Google (${this.user.name})!`);
      this.navigateTo('home');
      if (window.lucide) window.lucide.createIcons();
    }

    handleCustomGoogleLogin() {
      const nameInput = document.getElementById('custom-google-name');
      const emailInput = document.getElementById('custom-google-email');
      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email || !email.includes('@')) {
        this.showToast('Por favor introduz um e-mail Google/Gmail válido.');
        return;
      }

      const generatedAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=1db954&color=000&bold=true`;
      this.completeGoogleAuth(name || email.split('@')[0], email, generatedAvatar);
    }

    continueAsGuest() {
      localStorage.setItem('musicflow_user_authenticated', 'guest');
      const welcomeOverlay = document.getElementById('modal-auth-welcome');
      if (welcomeOverlay) welcomeOverlay.classList.add('hidden');
      this.showToast('Bem-vindo ao MusicFlow (Modo Offline)');
    }

    logout() {
      if (confirm('Desejas terminar a sessão da tua conta Google no MusicFlow?')) {
        localStorage.removeItem('musicflow_user_authenticated');
        localStorage.removeItem('musicflow_user');
        this.user = getCurrentUser();
        window.audioEngine.pause();
        const welcomeOverlay = document.getElementById('modal-auth-welcome');
        if (welcomeOverlay) welcomeOverlay.classList.remove('hidden');
        this.updateUserInterfaceHeader();
        this.showToast('Sessão terminada.');
        if (window.lucide) window.lucide.createIcons();
      }
    }

    async navigateTo(viewId, param = null) {
      this.currentView = viewId;

      const views = [
        'home', 'library', 'search', 'playlists', 'playlist-detail',
        'album-detail', 'artist-detail', 'history', 'stats', 'profile', 'settings', 'admin'
      ];
      views.forEach(id => {
        const el = document.getElementById(`view-${id}`);
        if (el) el.classList.add('hidden');
      });

      const targetEl = document.getElementById(`view-${viewId}`);
      if (targetEl) targetEl.classList.remove('hidden');

      document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('data-target') === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
      });

      if (viewId === 'home') await this.renderHomeView();
      else if (viewId === 'library') await this.renderLibraryView(param);
      else if (viewId === 'playlists') await this.renderPlaylistsView();
      else if (viewId === 'history') await this.renderHistoryView();
      else if (viewId === 'stats') await this.renderStatsView();
      else if (viewId === 'admin') this.renderAdminView();

      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.lucide) window.lucide.createIcons();
    }

    async renderHomeView() {
      await this.loadAppData();

      const emptyCta = document.getElementById('home-empty-cta');
      const secRecent = document.getElementById('home-section-recent');
      const secFavs = document.getElementById('home-section-favorites');
      const secAlbums = document.getElementById('home-section-albums');
      const secArtists = document.getElementById('home-section-artists');

      if (this.songs.length === 0) {
        if (emptyCta) emptyCta.classList.remove('hidden');
        if (secRecent) secRecent.classList.add('hidden');
        if (secFavs) secFavs.classList.add('hidden');
        if (secAlbums) secAlbums.classList.add('hidden');
        if (secArtists) secArtists.classList.add('hidden');
      } else {
        if (emptyCta) emptyCta.classList.add('hidden');
        if (secRecent) secRecent.classList.remove('hidden');
        if (secFavs) secFavs.classList.remove('hidden');
        if (secAlbums) secAlbums.classList.remove('hidden');
        if (secArtists) secArtists.classList.remove('hidden');

        const recentSongs = [...this.songs].sort((a, b) => new Date(b.last_played || 0) - new Date(a.last_played || 0)).slice(0, 5);
        this.renderSongCardsGrid('home-recent-list', recentSongs);

        const favSongs = this.songs.filter(s => s.favorite).slice(0, 5);
        this.renderSongCardsGrid('home-favorites-list', favSongs);

        const albumMap = new Map();
        this.songs.forEach(s => {
          if (s.album && !albumMap.has(s.album)) {
            albumMap.set(s.album, { name: s.album, artist: s.artist, cover_url: s.cover_url });
          }
        });
        this.renderAlbumCardsGrid('home-albums-list', Array.from(albumMap.values()).slice(0, 5));

        const artistMap = new Map();
        this.songs.forEach(s => {
          if (s.artist && !artistMap.has(s.artist)) {
            artistMap.set(s.artist, { name: s.artist, image_url: s.cover_url });
          }
        });
        this.renderArtistCardsGrid('home-artists-list', Array.from(artistMap.values()).slice(0, 5));
      }

      this.renderPlaylistsCardsGrid('home-playlists-list', this.playlists.slice(0, 5));
    }

    renderSongCardsGrid(containerId, songs) {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (songs.length === 0) {
        container.innerHTML = `<div class="col-span-full py-8 text-center text-[var(--text-muted)] text-xs">Nenhuma música encontrada nesta secção.</div>`;
        return;
      }

      container.innerHTML = songs.map(song => `
        <div class="music-card rounded-2xl p-3 cursor-pointer group flex flex-col justify-between" onclick="app.playSongDirect('${song.id}')">
          <div class="relative aspect-square w-full rounded-xl overflow-hidden mb-2.5">
            <img src="${song.cover_url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${song.title}">
            <button class="play-btn-overlay absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
              <i data-lucide="play" class="w-5 h-5 fill-current ml-0.5"></i>
            </button>
          </div>
          <div class="flex items-start justify-between gap-1">
            <div class="min-w-0 flex-1">
              <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
              <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist}</p>
            </div>
            <button onclick="event.stopPropagation(); app.addToQueueDirect('${song.id}')" class="text-zinc-400 hover:text-brand-spotify p-1 rounded transition" title="Adicionar à Fila">
              <i data-lucide="plus-circle" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');
      if (window.lucide) window.lucide.createIcons();
    }

    renderAlbumCardsGrid(containerId, albums) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = albums.map(alb => `
        <div class="music-card rounded-2xl p-3 cursor-pointer group" onclick="app.viewAlbumDetail('${alb.name}')">
          <div class="aspect-square w-full rounded-xl overflow-hidden mb-2.5">
            <img src="${alb.cover_url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${alb.name}">
          </div>
          <h4 class="text-xs font-bold text-white truncate">${alb.name}</h4>
          <p class="text-[11px] text-[var(--text-secondary)] truncate">${alb.artist}</p>
        </div>
      `).join('');
    }

    renderArtistCardsGrid(containerId, artists) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = artists.map(art => `
        <div class="music-card rounded-2xl p-3 cursor-pointer group text-center" onclick="app.viewArtistDetail('${art.name}')">
          <div class="aspect-square w-24 h-24 mx-auto rounded-full overflow-hidden mb-2.5 border-2 border-transparent group-hover:border-brand-spotify transition">
            <img src="${art.image_url}" class="w-full h-full object-cover" alt="${art.name}">
          </div>
          <h4 class="text-xs font-bold text-white truncate">${art.name}</h4>
          <p class="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold mt-0.5">Artista</p>
        </div>
      `).join('');
    }

    renderPlaylistsCardsGrid(containerId, playlists) {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (playlists.length === 0) {
        container.innerHTML = `<div class="col-span-full py-6 text-center text-[var(--text-muted)] text-xs">Cria a tua primeira playlist com o botão acima.</div>`;
        return;
      }
      container.innerHTML = playlists.map(pl => `
        <div class="music-card rounded-2xl p-3 cursor-pointer group" onclick="app.viewPlaylistDetail('${pl.id}')">
          <div class="aspect-square w-full rounded-xl overflow-hidden mb-2.5">
            <img src="${pl.cover_url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${pl.name}">
          </div>
          <h4 class="text-xs font-bold text-white truncate">${pl.name}</h4>
          <p class="text-[11px] text-[var(--text-secondary)] truncate">${pl.description || 'Playlist do Utilizador'}</p>
        </div>
      `).join('');
    }

    filterLibrary(tabName) {
      this.libraryFilter = tabName;
      document.querySelectorAll('.lib-tab').forEach(t => {
        if (t.getAttribute('data-tab') === tabName) t.classList.add('active', 'border-brand-spotify');
        else t.classList.remove('active', 'border-brand-spotify');
      });
      this.renderLibraryView();
    }

    sortLibrary(sortKey) {
      this.librarySort = sortKey;
      this.renderLibraryView();
    }

    toggleLibraryViewMode() {
      this.libraryViewMode = this.libraryViewMode === 'grid' ? 'list' : 'grid';
      const btn = document.getElementById('view-toggle-btn');
      if (btn) btn.innerHTML = `<i data-lucide="${this.libraryViewMode === 'grid' ? 'list' : 'layout-grid'}" class="w-4 h-4"></i>`;
      this.renderLibraryView();
      if (window.lucide) window.lucide.createIcons();
    }

    async renderLibraryView(tabOverride = null) {
      if (tabOverride) this.libraryFilter = tabOverride;
      await this.loadAppData();

      let filtered = [...this.songs];
      if (this.libraryFilter === 'favorites') filtered = filtered.filter(s => s.favorite);
      else if (this.libraryFilter === 'albums') {
        const albumMap = new Map();
        this.songs.forEach(s => {
          if (s.album && !albumMap.has(s.album)) albumMap.set(s.album, { name: s.album, artist: s.artist, cover_url: s.cover_url });
        });
        this.renderAlbumCardsGrid('library-content-list', Array.from(albumMap.values()));
        document.getElementById('library-count-label').innerText = `${albumMap.size} álbuns encontrados`;
        return;
      } else if (this.libraryFilter === 'artists') {
        const artistMap = new Map();
        this.songs.forEach(s => {
          if (s.artist && !artistMap.has(s.artist)) artistMap.set(s.artist, { name: s.artist, image_url: s.cover_url });
        });
        this.renderArtistCardsGrid('library-content-list', Array.from(artistMap.values()));
        document.getElementById('library-count-label').innerText = `${artistMap.size} artistas encontrados`;
        return;
      } else if (this.libraryFilter === 'genres') {
        const genres = [...new Set(this.songs.map(s => s.genre).filter(Boolean))];
        const container = document.getElementById('library-content-list');
        container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4';
        container.innerHTML = genres.map(g => `
          <div class="music-card rounded-2xl p-5 cursor-pointer bg-gradient-to-br from-indigo-900/40 to-zinc-900 border border-zinc-800" onclick="app.filterByGenre('${g}')">
            <h4 class="text-base font-bold text-white">${g}</h4>
            <p class="text-xs text-[var(--text-secondary)] mt-1">${this.songs.filter(s => s.genre === g).length} músicas</p>
          </div>
        `).join('');
        document.getElementById('library-count-label').innerText = `${genres.length} géneros encontrados`;
        return;
      }

      filtered.sort((a, b) => {
        if (this.librarySort === 'title') return a.title.localeCompare(b.title);
        if (this.librarySort === 'artist') return a.artist.localeCompare(b.artist);
        if (this.librarySort === 'album') return a.album.localeCompare(b.album);
        if (this.librarySort === 'date_added') return new Date(b.date_added) - new Date(a.date_added);
        if (this.librarySort === 'play_count') return b.play_count - a.play_count;
        return 0;
      });

      const countLabel = document.getElementById('library-count-label');
      if (countLabel) countLabel.innerText = `${filtered.length} faixas disponíveis na aplicação`;

      const container = document.getElementById('library-content-list');
      if (!container) return;

      if (filtered.length === 0) {
        container.className = 'grid grid-cols-1';
        container.innerHTML = `
          <div class="py-16 text-center space-y-4 max-w-sm mx-auto">
            <div class="w-14 h-14 rounded-2xl bg-zinc-900 text-brand-spotify flex items-center justify-center mx-auto border border-zinc-800">
              <i data-lucide="folder-search" class="w-7 h-7"></i>
            </div>
            <div class="space-y-1">
              <h4 class="text-base font-bold">A tua biblioteca está pronta</h4>
              <p class="text-xs text-[var(--text-secondary)]">Deteta automaticamente as músicas MP3 do teu dispositivo para adicionares as tuas próprias faixas.</p>
            </div>
            <button onclick="app.openImportModal()" class="bg-brand-spotify hover:bg-brand-spotifyHover text-black text-xs font-bold px-5 py-3 rounded-xl transition shadow-lg">
              Detetar Músicas MP3 (&ge; 50KB)
            </button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      if (this.libraryViewMode === 'grid') {
        container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
        this.renderSongCardsGrid('library-content-list', filtered);
      } else {
        container.className = 'space-y-2';
        container.innerHTML = filtered.map((song, idx) => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] group cursor-pointer" onclick="app.playSongDirect('${song.id}')">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xs font-mono text-[var(--text-muted)] w-5 text-center">${idx + 1}</span>
              <img src="${song.cover_url}" class="w-10 h-10 rounded-lg object-cover" alt="${song.title}">
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
                <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist} • ${song.album}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>${this.formatDuration(song.duration)}</span>
              <button onclick="event.stopPropagation(); app.addToQueueDirect('${song.id}')" class="p-1.5 hover:text-brand-spotify transition" title="Adicionar à Fila">
                <i data-lucide="plus-circle" class="w-4 h-4"></i>
              </button>
              <button onclick="event.stopPropagation(); app.toggleFavorite('${song.id}')" class="p-1.5 hover:text-red-500 transition">
                <i data-lucide="heart" class="w-4 h-4 ${song.favorite ? 'text-red-500 fill-current' : ''}"></i>
              </button>
            </div>
          </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
      }
    }

    filterByGenre(genre) {
      const filtered = this.songs.filter(s => s.genre === genre);
      this.libraryFilter = 'songs';
      const container = document.getElementById('library-content-list');
      container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
      this.renderSongCardsGrid('library-content-list', filtered);
      document.getElementById('library-count-label').innerText = `${filtered.length} músicas em "${genre}"`;
    }

    async renderPlaylistsView() {
      this.playlists = await getUserPlaylists(this.user.id);
      this.renderPlaylistsCardsGrid('playlists-grid', this.playlists);
    }

    async viewPlaylistDetail(playlistId) {
      this.activePlaylist = this.playlists.find(p => p.id === playlistId);
      if (!this.activePlaylist) return;

      document.getElementById('pl-detail-cover').src = this.activePlaylist.cover_url;
      document.getElementById('pl-detail-name').innerText = this.activePlaylist.name;
      document.getElementById('pl-detail-desc').innerText = this.activePlaylist.description || 'Playlist Pessoal';

      const songs = await getPlaylistSongs(playlistId);
      document.getElementById('pl-detail-count').innerText = `${songs.length} faixas`;

      const playBtn = document.getElementById('pl-detail-play-btn');
      if (playBtn) playBtn.onclick = () => {
        if (songs.length > 0) {
          window.audioEngine.setQueue(songs, 0);
          window.audioEngine.play();
        }
      };

      const listEl = document.getElementById('pl-detail-songs-list');
      if (songs.length === 0) {
        listEl.innerHTML = `<p class="py-8 text-center text-xs text-[var(--text-muted)]">Esta playlist ainda não contém músicas.</p>`;
      } else {
        listEl.innerHTML = songs.map((song, idx) => `
          <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] group cursor-pointer" onclick="app.playSongDirect('${song.id}')">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xs font-mono text-[var(--text-muted)] w-5 text-center">${idx + 1}</span>
              <img src="${song.cover_url}" class="w-10 h-10 rounded-lg object-cover" alt="${song.title}">
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
                <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="event.stopPropagation(); app.addToQueueDirect('${song.id}')" class="p-1.5 text-zinc-400 hover:text-brand-spotify transition" title="Adicionar à Fila">
                <i data-lucide="plus-circle" class="w-4 h-4"></i>
              </button>
              <span class="text-xs font-mono text-[var(--text-muted)]">${this.formatDuration(song.duration)}</span>
            </div>
          </div>
        `).join('');
      }

      this.navigateTo('playlist-detail');
    }

    viewAlbumDetail(albumName) {
      const albumSongs = this.songs.filter(s => s.album === albumName);
      if (albumSongs.length === 0) return;

      const first = albumSongs[0];
      document.getElementById('alb-detail-cover').src = first.cover_url;
      document.getElementById('alb-detail-name').innerText = albumName;
      document.getElementById('alb-detail-artist').innerText = first.artist;
      document.getElementById('alb-detail-meta').innerText = `${albumSongs.length} faixas • ${first.year || 2025}`;

      const playBtn = document.getElementById('alb-detail-play-btn');
      if (playBtn) playBtn.onclick = () => {
        window.audioEngine.setQueue(albumSongs, 0);
        window.audioEngine.play();
      };

      const listEl = document.getElementById('alb-detail-songs-list');
      listEl.innerHTML = albumSongs.map((song, idx) => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] group cursor-pointer" onclick="app.playSongDirect('${song.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-mono text-[var(--text-muted)] w-5 text-center">${idx + 1}</span>
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
              <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist}</p>
            </div>
          </div>
          <span class="text-xs font-mono text-[var(--text-muted)]">${this.formatDuration(song.duration)}</span>
        </div>
      `).join('');

      this.navigateTo('album-detail');
    }

    viewArtistDetail(artistName) {
      const artistSongs = this.songs.filter(s => s.artist === artistName);
      if (artistSongs.length === 0) return;

      const first = artistSongs[0];
      document.getElementById('art-detail-img').src = first.cover_url;
      document.getElementById('art-detail-name').innerText = artistName;
      document.getElementById('art-detail-meta').innerText = `${artistSongs.length} faixas registadas`;

      const playBtn = document.getElementById('art-detail-play-btn');
      if (playBtn) playBtn.onclick = () => {
        window.audioEngine.setQueue(artistSongs, 0);
        window.audioEngine.play();
      };

      const listEl = document.getElementById('art-detail-songs-list');
      listEl.innerHTML = artistSongs.map((song, idx) => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] group cursor-pointer" onclick="app.playSongDirect('${song.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-mono text-[var(--text-muted)] w-5 text-center">${idx + 1}</span>
            <img src="${song.cover_url}" class="w-10 h-10 rounded-lg object-cover" alt="${song.title}">
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
              <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.album}</p>
            </div>
          </div>
          <span class="text-xs font-mono text-[var(--text-muted)]">${this.formatDuration(song.duration)}</span>
        </div>
      `).join('');

      this.navigateTo('artist-detail');
    }

    handleSearchInput(query) {
      const q = query.trim().toLowerCase();
      const container = document.getElementById('search-results-container');
      if (!q) {
        container.innerHTML = `<div class="text-center py-16 text-[var(--text-muted)]"><p class="text-sm">Escreve acima para encontrar na tua biblioteca musical.</p></div>`;
        return;
      }

      const matchedSongs = this.songs.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
      );

      if (matchedSongs.length === 0) {
        container.innerHTML = `<div class="text-center py-16 text-[var(--text-muted)]"><p class="text-sm">Nenhum resultado encontrado para "${query}".</p></div>`;
        return;
      }

      container.innerHTML = `
        <h3 class="text-base font-bold mb-3">Músicas (${matchedSongs.length})</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${matchedSongs.map(song => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] cursor-pointer" onclick="app.playSongDirect('${song.id}')">
              <img src="${song.cover_url}" class="w-12 h-12 rounded-lg object-cover" alt="${song.title}">
              <div class="min-w-0 flex-1">
                <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
                <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist} • ${song.album}</p>
              </div>
              <button onclick="event.stopPropagation(); app.addToQueueDirect('${song.id}')" class="p-2 text-zinc-400 hover:text-brand-spotify transition" title="Adicionar à Fila">
                <i data-lucide="plus-circle" class="w-4 h-4"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    async renderHistoryView() {
      const historyEntries = await idbGetAll('history');
      const container = document.getElementById('history-timeline');
      if (!container) return;

      if (historyEntries.length === 0) {
        container.innerHTML = `<div class="py-16 text-center text-xs text-[var(--text-muted)]">Ainda não tens registos de reprodução no histórico.</div>`;
        return;
      }

      const songMap = new Map(this.songs.map(s => [s.id, s]));

      container.innerHTML = historyEntries.slice(0, 30).map(item => {
        const song = songMap.get(item.song_id);
        if (!song) return '';
        const dateStr = new Date(item.played_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
        return `
          <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${song.cover_url}" class="w-10 h-10 rounded-lg object-cover" alt="${song.title}">
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
                <p class="text-[11px] text-[var(--text-secondary)] truncate">${song.artist}</p>
              </div>
            </div>
            <span class="text-[10px] text-[var(--text-muted)] font-mono">${dateStr}</span>
          </div>
        `;
      }).join('');
    }

    async renderStatsView() {
      const historyEntries = await idbGetAll('history');
      const totalMinutes = Math.round(historyEntries.length * 2.5);

      document.getElementById('stat-total-songs').innerText = this.songs.length;
      document.getElementById('stat-total-minutes').innerText = `${totalMinutes} min`;
      document.getElementById('stat-total-playlists').innerText = this.playlists.length;

      const songCounts = {};
      historyEntries.forEach(h => {
        songCounts[h.song_id] = (songCounts[h.song_id] || 0) + 1;
      });
      let topSongId = Object.keys(songCounts).sort((a, b) => songCounts[b] - songCounts[a])[0];
      const topSong = this.songs.find(s => s.id === topSongId);

      const topSongCard = document.getElementById('stat-top-song-card');
      if (topSong && topSongCard) {
        topSongCard.innerHTML = `
          <img src="${topSong.cover_url}" class="w-12 h-12 rounded-xl object-cover" alt="${topSong.title}">
          <div>
            <h4 class="text-xs font-bold text-white">${topSong.title}</h4>
            <p class="text-[11px] text-[var(--text-secondary)]">${topSong.artist}</p>
          </div>
        `;
      } else if (topSongCard) {
        topSongCard.innerHTML = `<p class="text-xs text-[var(--text-muted)]">Nenhuma música reproduzida ainda.</p>`;
      }

      const topArtistCard = document.getElementById('stat-top-artist-card');
      if (topSong && topArtistCard) {
        topArtistCard.innerHTML = `
          <img src="${topSong.cover_url}" class="w-12 h-12 rounded-full object-cover" alt="${topSong.artist}">
          <div>
            <h4 class="text-xs font-bold text-white">${topSong.artist}</h4>
            <p class="text-[11px] text-[var(--text-secondary)]">${topSong.album}</p>
          </div>
        `;
      } else if (topArtistCard) {
        topArtistCard.innerHTML = `<p class="text-xs text-[var(--text-muted)]">Nenhum artista registado.</p>`;
      }
    }

    renderAdminView() {
      const songCountEl = document.getElementById('admin-stat-songs');
      if (songCountEl) songCountEl.innerText = this.songs.length;
    }

    playSongDirect(songId) {
      const index = this.songs.findIndex(s => s.id === songId);
      if (index !== -1) {
        window.audioEngine.setQueue(this.songs, index);
        window.audioEngine.play();
        recordPlay(this.user.id, songId);
      }
    }

    addToQueueDirect(songId, playNext = false) {
      const song = this.songs.find(s => s.id === songId);
      if (song) {
        window.audioEngine.addToQueue(song, playNext);
      }
    }

    async toggleFavorite(songId) {
      const newFavState = await toggleSongFavorite(this.user.id, songId);
      await this.loadAppData();
      this.showToast(newFavState ? 'Música adicionada aos Favoritos!' : 'Removida dos Favoritos');
      this.renderHomeView();
      this.renderLibraryView();
    }

    async toggleCurrentFavorite() {
      if (window.audioEngine.currentSong) {
        await this.toggleFavorite(window.audioEngine.currentSong.id);
      }
    }

    // ==========================================
    // 7. SPOTIFY-STYLE PLAYBACK QUEUE CONTROLLER
    // ==========================================

    openQueueModal() {
      this.renderQueueModalContent();
      document.getElementById('modal-queue').classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    renderQueueModalContent() {
      const queue = window.audioEngine.queue;
      const curIndex = window.audioEngine.currentIndex;
      const currentSong = window.audioEngine.currentSong || queue[curIndex];

      const countEl = document.getElementById('queue-tracks-count');
      if (countEl) countEl.innerText = `${queue.length} músicas na fila`;

      const nowPlayingBox = document.getElementById('queue-now-playing-item');
      if (currentSong && nowPlayingBox) {
        nowPlayingBox.classList.remove('hidden');
        document.getElementById('q-np-cover').src = currentSong.cover_url;
        document.getElementById('q-np-title').innerText = currentSong.title;
        document.getElementById('q-np-artist').innerText = currentSong.artist;
        document.getElementById('q-np-duration').innerText = this.formatDuration(currentSong.duration);
      } else if (nowPlayingBox) {
        nowPlayingBox.classList.add('hidden');
      }

      const upcomingContainer = document.getElementById('queue-upcoming-list');
      if (!upcomingContainer) return;

      const upcomingSongs = queue.slice(curIndex + 1);

      if (upcomingSongs.length === 0) {
        upcomingContainer.innerHTML = `
          <div class="py-8 text-center space-y-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-4">
            <i data-lucide="music-2" class="w-8 h-8 mx-auto text-zinc-600"></i>
            <p class="text-xs text-zinc-400">Não há mais músicas a seguir na fila.</p>
            <button onclick="app.openAddToQueueModal()" class="px-4 py-2 bg-brand-spotify hover:bg-brand-spotifyHover text-black text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar Músicas
            </button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      upcomingContainer.innerHTML = upcomingSongs.map((song, relIdx) => {
        const actualIdx = curIndex + 1 + relIdx;
        const isFirstUpcoming = relIdx === 0;
        const isLastUpcoming = relIdx === upcomingSongs.length - 1;

        return `
          <div id="q-row-${actualIdx}"
               class="queue-item flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 transition group cursor-pointer"
               draggable="true"
               ondragstart="app.handleQueueDragStart(event, ${actualIdx})"
               ondragover="app.handleQueueDragOver(event, ${actualIdx})"
               ondragleave="app.handleQueueDragLeave(event, ${actualIdx})"
               ondrop="app.handleQueueDrop(event, ${actualIdx})"
               onclick="app.selectQueueItem(${actualIdx})">
            
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 p-1" title="Arrastar para reordenar" onclick="event.stopPropagation()">
                <i data-lucide="grip-vertical" class="w-4 h-4"></i>
              </div>

              <span class="text-xs font-mono text-zinc-500 w-4 text-center">${relIdx + 1}</span>
              <img src="${song.cover_url}" class="w-10 h-10 rounded-xl object-cover border border-white/5" alt="${song.title}">
              
              <div class="min-w-0 flex-1">
                <h4 class="text-xs font-bold text-white truncate group-hover:text-brand-spotify transition">${song.title}</h4>
                <p class="text-[10px] text-zinc-400 truncate">${song.artist}</p>
              </div>
            </div>

            <div class="flex items-center gap-1" onclick="event.stopPropagation()">
              <button onclick="app.moveQueueItemOrder(${actualIdx}, -1)" class="p-1.5 text-zinc-400 hover:text-white rounded transition ${isFirstUpcoming ? 'opacity-30 pointer-events-none' : ''}" title="Mover para cima">
                <i data-lucide="chevron-up" class="w-4 h-4"></i>
              </button>
              <button onclick="app.moveQueueItemOrder(${actualIdx}, 1)" class="p-1.5 text-zinc-400 hover:text-white rounded transition ${isLastUpcoming ? 'opacity-30 pointer-events-none' : ''}" title="Mover para baixo">
                <i data-lucide="chevron-down" class="w-4 h-4"></i>
              </button>
              <button onclick="app.removeSongFromQueue(${actualIdx})" class="p-1.5 text-zinc-500 hover:text-red-400 rounded transition" title="Remover da fila">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide) window.lucide.createIcons();
    }

    selectQueueItem(actualIndex) {
      window.audioEngine.playQueueIndex(actualIndex);
      this.renderQueueModalContent();
    }

    moveQueueItemOrder(fromIndex, offset) {
      const toIndex = fromIndex + offset;
      window.audioEngine.moveQueueItem(fromIndex, toIndex);
      this.renderQueueModalContent();
    }

    removeSongFromQueue(index) {
      window.audioEngine.removeFromQueue(index);
      this.renderQueueModalContent();
    }

    clearUpcomingQueue() {
      window.audioEngine.clearUpcomingQueue();
      this.renderQueueModalContent();
    }

    handleQueueDragStart(e, index) {
      this.draggedQueueIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      const row = document.getElementById(`q-row-${index}`);
      if (row) row.classList.add('dragging');
    }

    handleQueueDragOver(e, index) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const row = document.getElementById(`q-row-${index}`);
      if (row && index !== this.draggedQueueIndex) {
        row.classList.add('drag-over');
      }
    }

    handleQueueDragLeave(e, index) {
      const row = document.getElementById(`q-row-${index}`);
      if (row) row.classList.remove('drag-over');
    }

    handleQueueDrop(e, targetIndex) {
      e.preventDefault();
      const fromIndex = this.draggedQueueIndex;
      if (fromIndex !== null && fromIndex !== targetIndex) {
        window.audioEngine.moveQueueItem(fromIndex, targetIndex);
      }
      this.draggedQueueIndex = null;
      this.renderQueueModalContent();
    }

    openAddToQueueModal() {
      this.filterAddToQueueList('');
      document.getElementById('modal-add-to-queue').classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    filterAddToQueueList(query) {
      const container = document.getElementById('add-queue-songs-list');
      if (!container) return;

      const q = query.trim().toLowerCase();
      const matched = this.songs.filter(s =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
      );

      if (matched.length === 0) {
        container.innerHTML = `<p class="text-xs text-zinc-500 text-center py-8">Nenhuma música encontrada na biblioteca.</p>`;
        return;
      }

      container.innerHTML = matched.map(song => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 transition">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <img src="${song.cover_url}" class="w-10 h-10 rounded-lg object-cover" alt="${song.title}">
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-white truncate">${song.title}</h4>
              <p class="text-[10px] text-zinc-400 truncate">${song.artist} • ${this.formatDuration(song.duration)}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.addSongToActiveQueue('${song.id}', true)" class="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold rounded-lg transition" title="Tocar logo a seguir à atual">
              A Seguir
            </button>
            <button onclick="app.addSongToActiveQueue('${song.id}', false)" class="px-3 py-1.5 bg-brand-spotify hover:bg-brand-spotifyHover text-black text-[11px] font-bold rounded-lg transition">
              + Fila
            </button>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    }

    addSongToActiveQueue(songId, playNext = false) {
      const song = this.songs.find(s => s.id === songId);
      if (song) {
        window.audioEngine.addToQueue(song, playNext);
        this.renderQueueModalContent();
      }
    }

    // =========================================================
    // 8. STRICT SONG-SPECIFIC SYNCHRONIZED KARAOKE LYRICS
    // =========================================================

    // Called immediately whenever a new song is loaded in the player
    onSongLoaded(song) {
      if (!song) return;

      // 1. Immediately reset active parsed lyrics so previous song's lyrics NEVER persist
      this.currentParsedLyrics = [];
      this.activeLyricIndex = -1;

      // 2. Elements references
      const inlinePrevLine = document.getElementById('fs-inline-prev-line');
      const inlineActiveLine = document.getElementById('fs-inline-active-line');
      const inlineNextLine = document.getElementById('fs-inline-next-line');
      const autoStatus = document.getElementById('fs-lyrics-auto-status');

      if (inlinePrevLine) inlinePrevLine.innerText = '';
      if (inlineNextLine) inlineNextLine.innerText = '';

      // 3. Update modal texts if open
      const titleEl = document.getElementById('lyrics-track-title');
      const artistEl = document.getElementById('lyrics-track-artist');
      const ambientBg = document.getElementById('lyrics-ambient-bg');
      if (titleEl) titleEl.innerText = song.title;
      if (artistEl) artistEl.innerText = song.artist;
      if (ambientBg) ambientBg.style.backgroundImage = `url(${song.cover_url})`;

      // 4. If this song already has its OWN lyrics stored, render them
      if (song.lyrics && song.lyrics.trim().length > 0) {
        this.currentParsedLyrics = parseLrcLyrics(song.lyrics);
        const isSynced = this.currentParsedLyrics.some(l => l.time >= 0);

        if (autoStatus) autoStatus.innerText = isSynced ? 'Sincronizada' : 'Texto';

        if (isSynced && this.currentParsedLyrics.length > 0) {
          if (inlineActiveLine) inlineActiveLine.innerText = this.currentParsedLyrics[0].text;
          if (inlineNextLine && this.currentParsedLyrics.length > 1) {
            inlineNextLine.innerText = this.currentParsedLyrics[1].text;
          }
        } else {
          const firstLines = song.lyrics.split('\n').filter(l => l.trim()).slice(0, 2).join(' • ');
          if (inlineActiveLine) inlineActiveLine.innerText = firstLines || 'Letra da música';
        }

        this.renderSynchronizedLyrics(song.lyrics, song.id);
      } else {
        if (inlineActiveLine) inlineActiveLine.innerText = 'Sem letra para esta música • Clica para adicionar';
        if (autoStatus) autoStatus.innerText = 'Sem Letra';

        this.renderSynchronizedLyrics('', song.id);
        this.autoRecognizeLyricsForSong(song);
      }
    }

    async autoRecognizeLyricsForSong(song) {
      if (!song || !song.id) return;

      // If song already has lyrics, do not re-fetch
      if (song.lyrics && song.lyrics.trim().length > 0) {
        if (window.audioEngine.currentSong && window.audioEngine.currentSong.id === song.id) {
          this.renderSynchronizedLyrics(song.lyrics, song.id);
        }
        return;
      }

      this.lyricsRecognizingSongId = song.id;

      try {
        const cleanTitle = song.title.replace(/\.mp3$/i, '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
        const cleanArtist = song.artist !== 'Artista Desconhecido' ? song.artist.replace(/\[.*?\]|\(.*?\)/g, '').trim() : '';

        let url = '';
        if (cleanArtist && cleanArtist.length > 1) {
          url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
        } else {
          url = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`;
        }

        const res = await fetch(url);
        let foundLyrics = '';

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            foundLyrics = data[0].syncedLyrics || data[0].plainLyrics || '';
          } else if (data && !Array.isArray(data)) {
            foundLyrics = data.syncedLyrics || data.plainLyrics || '';
          }
        } else {
          const fallbackRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`);
          if (fallbackRes.ok) {
            const list = await fallbackRes.json();
            if (Array.isArray(list) && list.length > 0) {
              foundLyrics = list[0].syncedLyrics || list[0].plainLyrics || '';
            }
          }
        }

        // Save found lyrics strictly to this song
        if (foundLyrics) {
          song.lyrics = foundLyrics;
          await updateSongInLibrary(song);

          // Update song reference in memory list
          const targetInList = this.songs.find(s => s.id === song.id);
          if (targetInList) targetInList.lyrics = foundLyrics;

          // ONLY render if this song is STILL currently playing
          if (window.audioEngine.currentSong && window.audioEngine.currentSong.id === song.id) {
            this.onSongLoaded(song);
          }
        } else {
          // No lyrics found for this specific song
          if (window.audioEngine.currentSong && window.audioEngine.currentSong.id === song.id) {
            const inlineActiveLine = document.getElementById('fs-inline-active-line');
            if (inlineActiveLine) inlineActiveLine.innerText = 'Sem letra para esta música • Clica para adicionar';
            const autoStatus = document.getElementById('fs-lyrics-auto-status');
            if (autoStatus) autoStatus.innerText = 'Indisponível';
            this.renderSynchronizedLyrics('', song.id);
          }
        }
      } catch (err) {
        if (window.audioEngine.currentSong && window.audioEngine.currentSong.id === song.id) {
          const autoStatus = document.getElementById('fs-lyrics-auto-status');
          if (autoStatus) autoStatus.innerText = 'Offline';
        }
      } finally {
        if (this.lyricsRecognizingSongId === song.id) {
          this.lyricsRecognizingSongId = null;
        }
      }
    }

    openLyricsModal() {
      const song = window.audioEngine.currentSong;
      const titleEl = document.getElementById('lyrics-track-title');
      const artistEl = document.getElementById('lyrics-track-artist');
      const ambientBg = document.getElementById('lyrics-ambient-bg');

      if (song) {
        if (titleEl) titleEl.innerText = song.title;
        if (artistEl) artistEl.innerText = song.artist;
        if (ambientBg) ambientBg.style.backgroundImage = `url(${song.cover_url})`;
        
        if (song.lyrics && song.lyrics.trim().length > 0) {
          this.renderSynchronizedLyrics(song.lyrics, song.id);
        } else {
          this.renderSynchronizedLyrics('', song.id);
          this.autoRecognizeLyricsForSong(song);
        }
      } else {
        if (titleEl) titleEl.innerText = 'Nenhuma música selecionada';
        if (artistEl) artistEl.innerText = '';
        this.renderSynchronizedLyrics('', null);
      }

      document.getElementById('modal-lyrics').classList.remove('hidden');
      if (window.lucide) window.lucide.createIcons();
    }

    renderSynchronizedLyrics(lyricsText, songId) {
      const container = document.getElementById('lyrics-scroll-container');
      const badge = document.getElementById('lyrics-synced-badge');
      const inlineActiveLine = document.getElementById('fs-inline-active-line');
      if (!container) return;

      this.currentParsedLyrics = parseLrcLyrics(lyricsText);
      this.activeLyricIndex = -1;

      if (!lyricsText || this.currentParsedLyrics.length === 0) {
        if (badge) badge.className = 'hidden';
        if (inlineActiveLine && window.audioEngine.currentSong && window.audioEngine.currentSong.id === songId) {
          inlineActiveLine.innerText = 'Sem letra para esta música • Clica para adicionar';
        }

        container.innerHTML = `
          <div class="py-16 text-center space-y-5 max-w-md mx-auto">
            <div class="w-16 h-16 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto border border-white/15">
              <i data-lucide="align-left" class="w-8 h-8"></i>
            </div>
            <div class="space-y-1">
              <h4 class="text-lg font-bold text-white">Letra ainda não disponível</h4>
              <p class="text-xs text-zinc-300">Podes pesquisar online, importar um ficheiro .lrc ou escrever manualmente para sincronizar com esta música.</p>
            </div>
            <div class="flex flex-wrap justify-center gap-2 pt-2">
              <button onclick="app.openOnlineLyricsSearch()" class="px-4 py-2.5 bg-white text-black font-bold text-xs rounded-xl flex items-center gap-2 transition shadow-lg">
                <i data-lucide="globe" class="w-4 h-4"></i> Procurar Online
              </button>
              <label class="px-4 py-2.5 bg-black/40 hover:bg-black/60 border border-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition">
                <i data-lucide="file-text" class="w-4 h-4 text-indigo-300"></i> Importar .LRC
                <input type="file" accept=".lrc,.txt" class="hidden" onchange="app.handleLyricsFileInput(this.files)">
              </label>
              <button onclick="app.openLyricsEditor()" class="px-4 py-2.5 bg-black/40 hover:bg-black/60 border border-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition">
                <i data-lucide="edit-3" class="w-4 h-4 text-amber-300"></i> Escrever
              </button>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const isSynced = this.currentParsedLyrics.some(l => l.time >= 0);
      if (badge) {
        badge.className = isSynced ? 'px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/20 text-white backdrop-blur-md' : 'hidden';
      }

      container.innerHTML = this.currentParsedLyrics.map((line, idx) => `
        <div id="lyric-line-${idx}" class="lyric-line" onclick="app.seekToLyric(${line.time})">
          ${line.text}
        </div>
      `).join('');

      this.updateActiveLyricsLine(window.audioEngine.currentTime);
    }

    updateActiveLyricsLine(currentTime) {
      if (!this.currentParsedLyrics || this.currentParsedLyrics.length === 0) {
        const inlineActiveLine = document.getElementById('fs-inline-active-line');
        if (inlineActiveLine && (!window.audioEngine.currentSong || !window.audioEngine.currentSong.lyrics)) {
          inlineActiveLine.innerText = 'Sem letra para esta música • Clica para adicionar';
        }
        return;
      }

      const isSynced = this.currentParsedLyrics.some(l => l.time >= 0);
      if (!isSynced) return;

      let activeIndex = -1;
      for (let i = 0; i < this.currentParsedLyrics.length; i++) {
        if (currentTime >= this.currentParsedLyrics[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      // If playback is before the first timestamp, default to first line
      if (activeIndex === -1 && this.currentParsedLyrics.length > 0) {
        activeIndex = 0;
      }

      if (activeIndex >= 0 && activeIndex !== this.activeLyricIndex) {
        if (this.activeLyricIndex >= 0) {
          const prevEl = document.getElementById(`lyric-line-${this.activeLyricIndex}`);
          if (prevEl) prevEl.classList.remove('lyric-line-active');
        }

        this.activeLyricIndex = activeIndex;

        // Update Mini-Card Rolling Snippet
        const inlinePrev = document.getElementById('fs-inline-prev-line');
        const inlineActive = document.getElementById('fs-inline-active-line');
        const inlineNext = document.getElementById('fs-inline-next-line');

        if (inlinePrev) {
          inlinePrev.innerText = activeIndex > 0 ? this.currentParsedLyrics[activeIndex - 1].text : '';
        }
        if (inlineActive && this.currentParsedLyrics[activeIndex]) {
          inlineActive.innerText = this.currentParsedLyrics[activeIndex].text;
        }
        if (inlineNext) {
          inlineNext.innerText = activeIndex < this.currentParsedLyrics.length - 1 ? this.currentParsedLyrics[activeIndex + 1].text : '';
        }

        // Highlight active line in full modal
        const curEl = document.getElementById(`lyric-line-${activeIndex}`);
        if (curEl) {
          curEl.classList.add('lyric-line-active');
          curEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    seekToLyric(timeSeconds) {
      if (timeSeconds < 0 || isNaN(timeSeconds)) return;
      window.audioEngine.seek(timeSeconds);
      if (!window.audioEngine.isPlaying) {
        window.audioEngine.play();
      }
    }

    openOnlineLyricsSearch() {
      const song = window.audioEngine.currentSong;
      const input = document.getElementById('online-lyrics-search-input');
      const resultBox = document.getElementById('online-lyrics-result-box');
      const applyBtn = document.getElementById('apply-online-lyrics-btn');

      if (song && input) {
        input.value = `${song.title} ${song.artist}`.replace('Artista Desconhecido', '').trim();
      }
      if (resultBox) {
        resultBox.innerHTML = `<p class="text-zinc-500 text-center py-6">Clica em "Procurar" para pesquisar letras na base aberta online.</p>`;
      }
      if (applyBtn) applyBtn.classList.add('hidden');

      document.getElementById('modal-online-lyrics').classList.remove('hidden');
    }

    async fetchOnlineLyrics() {
      const input = document.getElementById('online-lyrics-search-input');
      const resultBox = document.getElementById('online-lyrics-result-box');
      const applyBtn = document.getElementById('apply-online-lyrics-btn');
      const query = input ? input.value.trim() : '';

      if (!query) {
        this.showToast('Escreve o nome da música ou artista para pesquisar.');
        return;
      }

      resultBox.innerHTML = `<p class="text-brand-spotify text-center py-6 animate-pulse">A pesquisar letra sincronizada online...</p>`;

      try {
        const song = window.audioEngine.currentSong;
        let url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        if (song && song.title && song.artist && song.artist !== 'Artista Desconhecido') {
          url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(song.title)}&artist_name=${encodeURIComponent(song.artist)}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          const fallbackRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
          if (!fallbackRes.ok) throw new Error('Não foi possível encontrar a letra online.');
          const searchData = await fallbackRes.json();
          if (!searchData || searchData.length === 0) throw new Error('Nenhuma letra encontrada para esta pesquisa.');
          this.pendingOnlineLyrics = searchData[0].syncedLyrics || searchData[0].plainLyrics || '';
        } else {
          const data = await res.json();
          if (Array.isArray(data)) {
            if (data.length === 0) throw new Error('Nenhuma letra encontrada.');
            this.pendingOnlineLyrics = data[0].syncedLyrics || data[0].plainLyrics || '';
          } else {
            this.pendingOnlineLyrics = data.syncedLyrics || data.plainLyrics || '';
          }
        }

        if (!this.pendingOnlineLyrics) throw new Error('Letra vazia ou indisponível.');

        const previewLines = this.pendingOnlineLyrics.split('\n').slice(0, 15).join('\n');
        resultBox.innerHTML = `
          <div class="text-brand-spotify font-semibold mb-2">Letra sincronizada encontrada com sucesso!</div>
          <pre class="text-zinc-300 leading-relaxed overflow-x-auto">${previewLines}...</pre>
        `;
        if (applyBtn) applyBtn.classList.remove('hidden');
      } catch (err) {
        resultBox.innerHTML = `<p class="text-red-400 text-center py-6">${err.message || 'Erro ao obter letra online.'}</p>`;
        if (applyBtn) applyBtn.classList.add('hidden');
      }
    }

    async applyOnlineLyrics() {
      const song = window.audioEngine.currentSong;
      if (!song || !this.pendingOnlineLyrics) return;

      song.lyrics = this.pendingOnlineLyrics;
      await updateSongInLibrary(song);

      const targetInList = this.songs.find(s => s.id === song.id);
      if (targetInList) targetInList.lyrics = this.pendingOnlineLyrics;

      this.closeModal('modal-online-lyrics');
      this.onSongLoaded(song);
      this.showToast(`Letra sincronizada associada exclusivamente a "${song.title}"!`);
    }

    async handleLyricsFileInput(files) {
      if (!files || files.length === 0) return;
      const file = files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        const text = e.target.result;
        const song = window.audioEngine.currentSong;
        if (song) {
          song.lyrics = text;
          await updateSongInLibrary(song);

          const targetInList = this.songs.find(s => s.id === song.id);
          if (targetInList) targetInList.lyrics = text;

          this.onSongLoaded(song);
          this.showToast(`Ficheiro de letra (${file.name}) guardado para "${song.title}"!`);
        }
      };

      reader.readAsText(file);
    }

    openLyricsEditor() {
      const song = window.audioEngine.currentSong;
      const textarea = document.getElementById('lyrics-editor-textarea');
      const timestampEl = document.getElementById('editor-cur-timestamp');

      if (song && textarea) {
        textarea.value = song.lyrics || '';
      }
      if (timestampEl) {
        timestampEl.innerText = this.formatDuration(window.audioEngine.currentTime);
      }

      document.getElementById('modal-lyrics-editor').classList.remove('hidden');
    }

    insertCurrentAudioTimestamp() {
      const textarea = document.getElementById('lyrics-editor-textarea');
      if (!textarea) return;

      const time = window.audioEngine.currentTime;
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      const ms = Math.floor((time % 1) * 100);
      const tag = `[${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}.${ms < 10 ? '0' : ''}${ms}] `;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + tag + text.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      textarea.focus();
    }

    async saveManualLyrics() {
      const textarea = document.getElementById('lyrics-editor-textarea');
      const song = window.audioEngine.currentSong;
      if (!song || !textarea) return;

      song.lyrics = textarea.value.trim();
      await updateSongInLibrary(song);

      const targetInList = this.songs.find(s => s.id === song.id);
      if (targetInList) targetInList.lyrics = song.lyrics;

      this.closeModal('modal-lyrics-editor');
      this.onSongLoaded(song);
      this.showToast(`Letra guardada exclusivamente para "${song.title}"!`);
    }

    bindAudioSubscriptions() {
      window.audioEngine.subscribe(state => {
        const miniCover = document.getElementById('mini-cover');
        const miniTitle = document.getElementById('mini-title');
        const miniArtist = document.getElementById('mini-artist');
        const miniPlayIcon = document.getElementById('mini-play-icon');
        const miniEq = document.getElementById('mini-eq-indicator');
        const homeNpBanner = document.getElementById('home-now-playing-banner');

        if (state.currentSong) {
          if (miniCover) miniCover.src = state.currentSong.cover_url;
          if (miniTitle) miniTitle.innerText = state.currentSong.title;
          if (miniArtist) miniArtist.innerText = state.currentSong.artist;

          if (homeNpBanner) {
            homeNpBanner.classList.remove('hidden');
            document.getElementById('home-np-cover').src = state.currentSong.cover_url;
            document.getElementById('home-np-title').innerText = state.currentSong.title;
            document.getElementById('home-np-artist').innerText = state.currentSong.artist;
          }

          document.getElementById('fs-cover').src = state.currentSong.cover_url;
          document.getElementById('fs-title').innerText = state.currentSong.title;
          document.getElementById('fs-artist').innerText = state.currentSong.artist;
          document.getElementById('fs-album-name').innerText = state.currentSong.album || 'Álbum';

          const ambientBg = document.getElementById('ambient-glow-bg');
          if (ambientBg) ambientBg.style.backgroundImage = `url(${state.currentSong.cover_url})`;

          const fsFavBtn = document.getElementById('fs-fav-btn');
          if (fsFavBtn) {
            fsFavBtn.className = `p-3 transition ${state.currentSong.favorite ? 'text-red-500 fill-current' : 'text-zinc-400 hover:text-red-500'}`;
          }

          this.updateActiveLyricsLine(state.currentTime);
        }

        if (miniEq) {
          if (state.isPlaying && state.isEqEnabled) miniEq.classList.remove('hidden');
          else miniEq.classList.add('hidden');
        }

        if (miniPlayIcon) miniPlayIcon.setAttribute('data-lucide', state.isPlaying ? 'pause' : 'play');
        const fsPlayIcon = document.getElementById('fs-play-icon');
        if (fsPlayIcon) fsPlayIcon.setAttribute('data-lucide', state.isPlaying ? 'pause' : 'play');
        const homeNpPlayIcon = document.getElementById('home-np-play-icon');
        if (homeNpPlayIcon) homeNpPlayIcon.setAttribute('data-lucide', state.isPlaying ? 'pause' : 'play');
        const lyricsPlayBtn = document.getElementById('lyrics-play-btn');
        if (lyricsPlayBtn) lyricsPlayBtn.setAttribute('data-lucide', state.isPlaying ? 'pause' : 'play');

        const fsProgressBar = document.getElementById('fs-progress-bar');
        const fsCurrentTime = document.getElementById('fs-current-time');
        const fsDurationTime = document.getElementById('fs-duration-time');

        if (fsProgressBar && state.duration > 0) {
          fsProgressBar.max = state.duration;
          fsProgressBar.value = state.currentTime;
          const percent = ((state.currentTime / state.duration) * 100).toFixed(2);
          fsProgressBar.style.background = `linear-gradient(to right, #ffffff ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%)`;
        } else if (fsProgressBar) {
          fsProgressBar.value = 0;
          fsProgressBar.style.background = 'rgba(255, 255, 255, 0.2)';
        }
        if (fsCurrentTime) fsCurrentTime.innerText = this.formatDuration(state.currentTime);
        if (fsDurationTime) fsDurationTime.innerText = this.formatDuration(state.duration);

        const btnShuffle = document.getElementById('fs-btn-shuffle');
        if (btnShuffle) {
          btnShuffle.className = `p-2 transition ${state.shuffleMode ? 'text-brand-spotify' : 'text-zinc-400 hover:text-white'}`;
        }

        // Distinct Repeat Button with "1" badge for repeat-one mode
        const btnRepeat = document.getElementById('fs-btn-repeat');
        const repeatIcon = document.getElementById('fs-repeat-icon');
        const repeatOneBadge = document.getElementById('fs-repeat-one-badge');

        if (btnRepeat) {
          if (state.repeatMode === 'off') {
            btnRepeat.className = 'p-2 text-white/60 hover:text-white transition relative';
            if (repeatIcon) repeatIcon.setAttribute('data-lucide', 'repeat');
            if (repeatOneBadge) repeatOneBadge.classList.add('hidden');
          } else if (state.repeatMode === 'all') {
            btnRepeat.className = 'p-2 text-brand-spotify font-bold transition relative btn-repeat-active';
            if (repeatIcon) repeatIcon.setAttribute('data-lucide', 'repeat');
            if (repeatOneBadge) repeatOneBadge.classList.add('hidden');
          } else if (state.repeatMode === 'one') {
            btnRepeat.className = 'p-2 text-brand-spotify font-bold transition relative btn-repeat-active';
            if (repeatIcon) repeatIcon.setAttribute('data-lucide', 'repeat');
            if (repeatOneBadge) repeatOneBadge.classList.remove('hidden');
          }
        }

        const sleepLabel = document.getElementById('fs-sleep-label');
        const sleepSettingsStatus = document.getElementById('settings-sleep-timer-status');
        if (sleepLabel) {
          if (state.sleepTimeRemaining > 0) {
            const mins = Math.floor(state.sleepTimeRemaining / 60);
            const secs = state.sleepTimeRemaining % 60;
            const timeFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            sleepLabel.innerText = timeFormatted;
            sleepLabel.classList.add('text-brand-spotify', 'font-bold');
            if (sleepSettingsStatus) sleepSettingsStatus.innerText = timeFormatted;
          } else {
            sleepLabel.innerText = 'Temporizador';
            sleepLabel.classList.remove('text-brand-spotify', 'font-bold');
            if (sleepSettingsStatus) sleepSettingsStatus.innerText = 'Desligado';
          }
        }

        window.audioEngine.updateEqUIState();
        if (window.lucide) window.lucide.createIcons();
      });
    }

    openFullScreenPlayer() {
      const fsPlayer = document.getElementById('fullscreen-player');
      if (fsPlayer) {
        fsPlayer.classList.remove('translate-y-full');
        if (window.audioEngine.currentSong && window.audioEngine.currentSong.cover_url) {
          const ambientBg = document.getElementById('ambient-glow-bg');
          if (ambientBg) {
            ambientBg.style.backgroundImage = `url(${window.audioEngine.currentSong.cover_url})`;
          }
        }
      }
    }

    closeFullScreenPlayer() {
      const fsPlayer = document.getElementById('fullscreen-player');
      if (fsPlayer) fsPlayer.classList.add('translate-y-full');
    }

    openEqualizerModal() {
      window.audioEngine.updateEqUIState();
      document.getElementById('modal-equalizer').classList.remove('hidden');
    }

    openSleepTimerModal() {
      document.getElementById('modal-sleep-timer').classList.remove('hidden');
    }

    openImportModal() {
      const progBox = document.getElementById('import-progress-box');
      if (progBox) progBox.classList.add('hidden');
      document.getElementById('modal-import-audio').classList.remove('hidden');
    }

    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
    }

    async triggerDirectoryScan() {
      try {
        if (!window.showDirectoryPicker) {
          document.getElementById('folder-import-input').click();
          return;
        }

        const progBox = document.getElementById('import-progress-box');
        const progText = document.getElementById('import-progress-text');
        const progCount = document.getElementById('import-progress-count');
        const progBar = document.getElementById('import-progress-bar');

        if (progBox) progBox.classList.remove('hidden');
        if (progText) progText.innerText = 'A analisar pastas do dispositivo...';

        const dirHandle = await window.showDirectoryPicker();
        const audioFiles = [];

        async function scanDir(handle) {
          for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
              const name = entry.name.toLowerCase();
              if (name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav') || name.endsWith('.ogg')) {
                const file = await entry.getFile();
                if (file.size >= 50 * 1024) audioFiles.push(file);
              }
            } else if (entry.kind === 'directory') {
              await scanDir(entry);
            }
          }
        }

        await scanDir(dirHandle);

        if (audioFiles.length === 0) {
          this.showToast('Nenhum ficheiro de áudio (>= 50KB) encontrado na pasta.');
          if (progBox) progBox.classList.add('hidden');
          return;
        }

        const imported = await importAudioFiles(audioFiles, this.user.id, (c, t, f) => {
          if (progText) progText.innerText = `A importar: ${f.substring(0, 25)}...`;
          if (progCount) progCount.innerText = `${c}/${t}`;
          if (progBar) progBar.style.width = `${Math.round((c / t) * 100)}%`;
        });

        await this.loadAppData();
        this.closeModal('modal-import-audio');
        this.showToast(`${imported.length} músicas adicionadas à Biblioteca!`);
        this.renderHomeView();
        this.renderLibraryView();
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.showToast(err.message || 'Erro ao detetar ficheiros.');
        }
      }
    }

    async handleFileInput(files) {
      if (!files || files.length === 0) return;

      const progBox = document.getElementById('import-progress-box');
      const progText = document.getElementById('import-progress-text');
      const progCount = document.getElementById('import-progress-count');
      const progBar = document.getElementById('import-progress-bar');

      if (progBox) progBox.classList.remove('hidden');
      if (progText) progText.innerText = 'A filtrar e adicionar músicas (>= 50KB)...';

      const imported = await importAudioFiles(files, this.user.id, (c, t, f) => {
        if (progText) progText.innerText = `A importar: ${f.substring(0, 25)}...`;
        if (progCount) progCount.innerText = `${c}/${t}`;
        if (progBar) progBar.style.width = `${Math.round((c / t) * 100)}%`;
      });

      if (imported.length === 0) {
        this.showToast('Nenhum ficheiro compatível (>= 50KB) selecionado.');
        if (progBox) progBox.classList.add('hidden');
        return;
      }

      await this.loadAppData();
      this.closeModal('modal-import-audio');
      this.showToast(`${imported.length} músicas adicionadas à Biblioteca!`);
      this.renderHomeView();
      this.renderLibraryView();
    }

    bindDragAndDrop() {
      window.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          this.showToast('Músicas arrastadas detetadas...');
          this.handleFileInput(e.dataTransfer.files);
        }
      });
    }

    async openCreatePlaylistModal() {
      const name = prompt('Nome da nova Playlist:');
      if (name) {
        await createPlaylist(this.user.id, name);
        await this.loadAppData();
        this.renderPlaylistsView();
        this.showToast(`Playlist "${name}" criada com sucesso!`);
      }
    }

    async clearHistory() {
      await clearUserHistory(this.user.id);
      this.renderHistoryView();
      this.showToast('Histórico de reprodução limpo.');
    }

    async clearFullLibrary() {
      if (confirm('Tem a certeza que deseja remover todas as músicas da biblioteca?')) {
        await idbClear('songs');
        await idbClear('history');
        await idbClear('favorites');
        await idbClear('playlists');
        await idbClear('playlist_songs');
        window.audioEngine.pause();
        window.audioEngine.queue = [];
        window.audioEngine.currentSong = null;
        await this.loadAppData();
        this.renderHomeView();
        this.renderLibraryView();
        this.showToast('Biblioteca limpa com sucesso.');
      }
    }

    bindKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        if (e.code === 'Space') {
          e.preventDefault();
          window.audioEngine.togglePlay();
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          window.audioEngine.seek(window.audioEngine.currentTime + 5);
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          window.audioEngine.seek(window.audioEngine.currentTime - 5);
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          window.audioEngine.setVolume(window.audioEngine.volume + 0.1);
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          window.audioEngine.setVolume(window.audioEngine.volume - 0.1);
        } else if (e.key.toLowerCase() === 'm') {
          window.audioEngine.toggleMute();
        } else if (e.key.toLowerCase() === 'n') {
          window.audioEngine.next();
        } else if (e.key.toLowerCase() === 'p') {
          window.audioEngine.prev();
        } else if (e.key.toLowerCase() === 'l') {
          this.openLyricsModal();
        } else if (e.key.toLowerCase() === 'e') {
          this.openEqualizerModal();
        } else if (e.key.toLowerCase() === 'q') {
          this.openQueueModal();
        }
      });
    }

    bindSwipeGestures() {
      const fsPlayer = document.getElementById('fullscreen-player');
      if (!fsPlayer) return;

      fsPlayer.addEventListener('touchstart', (e) => {
        this.touchStartY = e.touches[0].clientY;
        this.touchStartX = e.touches[0].clientX;
      }, { passive: true });

      fsPlayer.addEventListener('touchend', (e) => {
        const deltaY = e.changedTouches[0].clientY - this.touchStartY;
        const deltaX = e.changedTouches[0].clientX - this.touchStartX;

        if (deltaY > 100) {
          this.closeFullScreenPlayer();
        } else if (deltaX < -80) {
          window.audioEngine.next();
        } else if (deltaX > 80) {
          window.audioEngine.prev();
        }
      }, { passive: true });
    }

    async forceAppUpdate() {
      this.showToast('A limpar cache e a obter a versão mais recente...');
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
        }
      } catch(e) {}
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?reload=' + Date.now();
      }, 400);
    }

    showToast(message) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerText = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 2800);
    }

    formatDuration(seconds) {
      if (!seconds || isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }

  // Initialize Global Singletons
  window.audioEngine = new AudioEngine();
  window.app = new MusicFlowApp();

})();
