/**
 * MusicFlow Core Audio & Web Audio API Equalizer Engine
 * Manages audio playback, Web Audio node routing, 7-band real equalizer, bass boost,
 * playback queue, repeat/shuffle modes, and sleep timer.
 */

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';

    // State
    this.currentSong = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 0.8;
    this.isMuted = false;
    this.shuffleMode = false; // false, true
    this.repeatMode = 'off'; // 'off', 'all', 'one'

    // Queue
    this.queue = [];
    this.currentIndex = -1;
    this.originalQueue = [];

    // Web Audio API & Equalizer Nodes
    this.audioCtx = null;
    this.sourceNode = null;
    this.eqNodes = [];
    this.bassNode = null;
    this.isEqInitialized = false;

    // EQ Frequencies (7 Bands as specified)
    this.frequencies = [60, 150, 400, 1000, 2400, 6000, 15000];
    this.eqGains = [0, 0, 0, 0, 0, 0, 0]; // dB gains
    this.bassBoostGain = 0; // 0 to 12 dB

    // EQ Presets
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

    // Sleep Timer
    this.sleepTimerId = null;
    this.sleepTimeRemaining = 0; // in seconds
    this.sleepTimerInterval = null;

    // Listeners
    this.listeners = new Set();

    this._bindAudioEvents();
  }

  _bindAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      this.duration = this.audio.duration || 0;
      this.emitChange();
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
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
      console.warn('Audio playback error:', e);
      this.isPlaying = false;
      this.emitChange();
    });
  }

  // Web Audio Context Initialization
  initWebAudio() {
    if (this.isEqInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // Create 7 BiquadFilterNodes
      let prevNode = this.sourceNode;
      this.eqNodes = this.frequencies.map((freq, idx) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = idx === 0 ? 'lowshelf' : (idx === this.frequencies.length - 1 ? 'highshelf' : 'peaking');
        filter.frequency.value = freq;
        filter.gain.value = this.eqGains[idx];
        filter.Q.value = 1.0;
        prevNode.connect(filter);
        prevNode = filter;
        return filter;
      });

      // Bass Boost Node (Low Shelf)
      this.bassNode = this.audioCtx.createBiquadFilter();
      this.bassNode.type = 'lowshelf';
      this.bassNode.frequency.value = 100;
      this.bassNode.gain.value = this.bassBoostGain;

      prevNode.connect(this.bassNode);
      this.bassNode.connect(this.audioCtx.destination);

      this.isEqInitialized = true;
    } catch (err) {
      console.warn('Web Audio API EQ initialization note:', err.message);
    }
  }

  setEqBand(index, gainValue) {
    if (index < 0 || index >= this.eqGains.length) return;
    this.eqGains[index] = gainValue;
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.value = gainValue;
    }
    this.emitChange();
  }

  setEqPreset(presetKey) {
    const preset = this.presets[presetKey.toLowerCase()];
    if (!preset) return;
    this.eqGains = [...preset];
    this.eqGains.forEach((gain, idx) => {
      if (this.eqNodes[idx]) {
        this.eqNodes[idx].gain.value = gain;
      }
    });
    this.emitChange();
  }

  setBassBoost(gainValue) {
    this.bassBoostGain = gainValue;
    if (this.bassNode) {
      this.bassNode.gain.value = gainValue;
    }
    this.emitChange();
  }

  // Playback Control
  setQueue(songs, startIndex = 0) {
    this.originalQueue = [...songs];
    if (this.shuffleMode) {
      this.queue = this._shuffleArray([...songs]);
      // Put selected song first if present
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
  }

  loadSong(song) {
    this.currentSong = song;
    this.audio.src = song.audio_url;
    this.audio.load();
    this.currentTime = 0;
    this.duration = song.duration || 0;
    this.emitChange();
  }

  async play() {
    if (!this.audio.src && this.queue.length > 0) {
      this.currentIndex = 0;
      this.loadSong(this.queue[0]);
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    this.initWebAudio();
    try {
      await this.audio.play();
      this.isPlaying = true;
      this.emitChange();
    } catch (e) {
      console.warn('Playback interrupted:', e);
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.emitChange();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
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
      if (this.repeatMode === 'all') {
        nextIndex = 0;
      } else {
        this.pause();
        return;
      }
    }

    this.currentIndex = nextIndex;
    const song = this.queue[this.currentIndex];
    if (song) {
      this.loadSong(song);
      this.play();
    }
  }

  prev() {
    if (this.queue.length === 0) return;
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }

    let prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.queue.length - 1;
    }

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
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';
    this.emitChange();
  }

  handleTrackEnded() {
    this.next();
  }

  // Queue Operations
  addToQueue(song) {
    this.queue.push(song);
    this.originalQueue.push(song);
    this.emitChange();
  }

  playNextInQueue(song) {
    const insertIdx = this.currentIndex + 1;
    this.queue.splice(insertIdx, 0, song);
    this.originalQueue.push(song);
    this.emitChange();
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      if (this.queue.length > 0) {
        this.currentIndex = Math.min(index, this.queue.length - 1);
        this.loadSong(this.queue[this.currentIndex]);
        if (this.isPlaying) this.play();
      } else {
        this.pause();
        this.currentSong = null;
      }
    }
    this.emitChange();
  }

  reorderQueue(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    const item = this.queue.splice(fromIndex, 1)[0];
    this.queue.splice(toIndex, 0, item);

    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    }
    this.emitChange();
  }

  clearQueue() {
    this.queue = this.currentSong ? [this.currentSong] : [];
    this.currentIndex = this.currentSong ? 0 : -1;
    this.originalQueue = [...this.queue];
    this.emitChange();
  }

  // Sleep Timer
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

  // Helpers & Listeners
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
      queue: this.queue,
      currentIndex: this.currentIndex,
      eqGains: this.eqGains,
      bassBoostGain: this.bassBoostGain,
      sleepTimeRemaining: this.sleepTimeRemaining
    };
  }
}

export const audioEngine = new AudioEngine();
