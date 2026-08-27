/**
 * MusicFlow Demonstration Data Generator
 * Generates 10 playable audio tracks with real procedural synth audio buffers,
 * artwork, metadata, lyrics, 5 artists, 4 albums, and 3 playlists.
 */

import { addSongToUserLibrary, createPlaylist, addSongToPlaylist } from './db.js';

// Procedurally generate a melodic ambient audio WAV Data URI (approx 30s)
function generateMelodicAudioDataUri(freqBase = 220, type = 'sine') {
  const sampleRate = 22050;
  const duration = 24; // 24 seconds audio
  const numSamples = sampleRate * duration;
  const buffer = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Simple chord progression (I - V - vi - IV)
    const chordStep = Math.floor((t % 8) / 2);
    const chords = [0, 7, 9, 5];
    const noteFreq = freqBase * Math.pow(2, chords[chordStep] / 12);
    
    // Waveform synthesis
    let sample = Math.sin(2 * Math.PI * noteFreq * t);
    sample += 0.5 * Math.sin(2 * Math.PI * (noteFreq * 1.5) * t); // fifth harmonic
    sample *= Math.exp(-3 * (t % 1)); // decay envelope per beat

    buffer[i] = Math.max(-32768, Math.min(32767, sample * 12000));
  }

  // Convert to WAV format
  const wavBuffer = new ArrayBuffer(44 + buffer.length * 2);
  const view = new DataView(wavBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + buffer.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, buffer.length * 2, true);

  // Write audio samples
  for (let i = 0; i < buffer.length; i++) {
    view.setInt16(44 + i * 2, buffer[i], true);
  }

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function seedDemoDataForUser(userId) {
  // Check if user already has songs
  const existingSongs = await db.songs.where('user_id').equals(userId).toArray();
  if (existingSongs.length > 0) return existingSongs;

  console.log('Generating demo audio tracks for MusicFlow...');

  const demoTracks = [
    {
      title: 'Midnight Flow',
      artist: 'Aura Wave',
      album: 'Neon Horizon',
      genre: 'Eletrónica',
      year: 2025,
      track_number: 1,
      duration: 24,
      freq: 261.63,
      cover_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Na calada da noite a luz brilha
[00:04.00] O ritmo corre pelas minhas veias
[00:08.00] Sente o fluxo da música
[00:12.00] MusicFlow na tua mente
[00:16.00] Nada pode nos parar agora
[00:20.00] Som puro, energia sem fim`
    },
    {
      title: 'Sol de Verão',
      artist: 'Luzia Silva',
      album: 'Vibrações Calmas',
      genre: 'Pop',
      year: 2024,
      track_number: 2,
      duration: 24,
      freq: 293.66,
      cover_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] O sol nasce na praia
[00:05.00] As ondas cantam em harmonia
[00:10.00] Risos e passos na areia
[00:15.00] Um dia perfeito em Lisboa`
    },
    {
      title: 'Urban Beats',
      artist: 'K-Pulse',
      album: 'Street Stories',
      genre: 'Hip-Hop',
      year: 2025,
      track_number: 1,
      duration: 24,
      freq: 329.63,
      cover_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Batida forte no asfalto
[00:06.00] Rimando a vida da cidade
[00:12.00] Passo a passo conquistamos o topo`
    },
    {
      title: 'Electric Dream',
      artist: 'Aura Wave',
      album: 'Neon Horizon',
      genre: 'Eletrónica',
      year: 2025,
      track_number: 2,
      duration: 24,
      freq: 349.23,
      cover_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Sintetizadores no ar
[00:06.00] Luzes de néon a piscar`
    },
    {
      title: 'Café & Bossa',
      artist: 'António & Trio',
      album: 'Noites de Jazz',
      genre: 'Jazz',
      year: 2023,
      track_number: 1,
      duration: 24,
      freq: 392.00,
      cover_url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Um café quente na mesa
[00:06.00] O saxofone toca suave`
    },
    {
      title: 'Riff Rebelde',
      artist: 'Thunder Voltage',
      album: 'Amplificado',
      genre: 'Rock',
      year: 2024,
      track_number: 1,
      duration: 24,
      freq: 440.00,
      cover_url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Guitarras a rugir no palco
[00:06.00] Energia pura no ar!`
    },
    {
      title: 'Sinfonia da Chuva',
      artist: 'Orquestra Harmonia',
      album: 'Clássicos Modernos',
      genre: 'Clássica',
      year: 2022,
      track_number: 1,
      duration: 24,
      freq: 493.88,
      cover_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Instrumental`
    },
    {
      title: 'Veludo Negro',
      artist: 'Luzia Silva',
      album: 'Vibrações Calmas',
      genre: 'R&B',
      year: 2024,
      track_number: 3,
      duration: 24,
      freq: 523.25,
      cover_url: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Vozes suaves na noite`
    },
    {
      title: 'Caminhos de Lisboa',
      artist: 'António & Trio',
      album: 'Noites de Jazz',
      genre: 'Jazz',
      year: 2023,
      track_number: 2,
      duration: 24,
      freq: 587.33,
      cover_url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Calçadas antigas, melodia Eterna`
    },
    {
      title: 'Deep Focus',
      artist: 'Aura Wave',
      album: 'Neon Horizon',
      genre: 'Eletrónica',
      year: 2025,
      track_number: 3,
      duration: 24,
      freq: 659.25,
      cover_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=500&q=80',
      lyrics: `[00:00.00] Concentração total`
    }
  ];

  const addedSongs = [];
  for (let i = 0; i < demoTracks.length; i++) {
    const track = demoTracks[i];
    const audioUrl = generateMelodicAudioDataUri(track.freq);
    const song = await addSongToUserLibrary({
      user_id: userId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      year: track.year,
      track_number: track.track_number,
      duration: track.duration,
      audio_url: audioUrl,
      cover_url: track.cover_url,
      file_format: 'audio/wav',
      file_size: 1024 * 500,
      lyrics: track.lyrics,
      favorite: i < 3 // First 3 favorited by default
    });
    addedSongs.push(song);
  }

  // Create initial demo playlists
  const pl1 = await createPlaylist(userId, 'As Minhas Favoritas', 'Músicas para energizar o teu dia');
  const pl2 = await createPlaylist(userId, 'Néons da Noite', 'Sintetizadores e ondas noturnas');
  const pl3 = await createPlaylist(userId, 'Chill & Focus', 'Ambiente relaxante para trabalhar');

  await addSongToPlaylist(pl1.id, addedSongs[0].id);
  await addSongToPlaylist(pl1.id, addedSongs[1].id);
  await addSongToPlaylist(pl1.id, addedSongs[2].id);

  await addSongToPlaylist(pl2.id, addedSongs[0].id);
  await addSongToPlaylist(pl2.id, addedSongs[3].id);
  await addSongToPlaylist(pl2.id, addedSongs[9].id);

  await addSongToPlaylist(pl3.id, addedSongs[4].id);
  await addSongToPlaylist(pl3.id, addedSongs[6].id);

  return addedSongs;
}
