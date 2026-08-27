/**
 * MusicFlow Database Module using Dexie.js (IndexedDB)
 * Manages persistent local data storage, library indexing, isolated user accounts,
 * play history, playlists, and settings.
 */

// Initialize Dexie DB instance
const db = new Dexie('MusicFlowDatabase');

db.version(1).stores({
  users: 'id, email, name, role',
  songs: 'id, user_id, title, artist, album, genre, date_added, play_count, last_played, favorite',
  albums: 'id, user_id, name, artist, genre',
  artists: 'id, user_id, name',
  playlists: 'id, user_id, name, created_at',
  playlist_songs: 'id, playlist_id, song_id, position',
  play_history: 'id, user_id, song_id, played_at',
  favorites: 'id, user_id, song_id, created_at',
  settings: 'user_id'
});

export default db;

// Helper Data Access Functions

export async function getCurrentUser() {
  let session = localStorage.getItem('musicflow_current_user');
  if (!session) {
    // Default logged-in user: André
    const defaultUser = {
      id: 'usr_andre_default',
      name: 'André',
      email: 'andre@musicflow.app',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
      role: 'user',
      theme: 'dark',
      language: 'pt',
      createdAt: new Date().toISOString()
    };
    await db.users.put(defaultUser);
    localStorage.setItem('musicflow_current_user', JSON.stringify(defaultUser));
    return defaultUser;
  }
  return JSON.parse(session);
}

export async function setCurrentUser(user) {
  await db.users.put(user);
  localStorage.setItem('musicflow_current_user', JSON.stringify(user));
  return user;
}

export async function getUserSettings(userId) {
  let settings = await db.settings.get(userId);
  if (!settings) {
    settings = {
      user_id: userId,
      theme: 'dark',
      language: 'pt',
      shuffle_default: false,
      repeat_default: 'off',
      audio_quality: 'high',
      autoplay: true,
      gapless_playback: true,
      notifications: true,
      accent_color: '#1db954'
    };
    await db.settings.put(settings);
  }
  return settings;
}

export async function updateUserSettings(userId, changes) {
  await db.settings.update(userId, changes);
  return await getUserSettings(userId);
}

export async function getSongsForUser(userId) {
  return await db.songs.where('user_id').equals(userId).toArray();
}

export async function addSongToUserLibrary(songData) {
  const songId = songData.id || 'sng_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const song = {
    ...songData,
    id: songId,
    date_added: songData.date_added || new Date().toISOString(),
    play_count: songData.play_count || 0,
    last_played: songData.last_played || null,
    favorite: songData.favorite || false
  };
  await db.songs.put(song);

  // Auto-index Album and Artist
  if (song.album) {
    const existingAlbum = await db.albums.where({ user_id: song.user_id, name: song.album }).first();
    if (!existingAlbum) {
      await db.albums.put({
        id: 'alb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        user_id: song.user_id,
        name: song.album,
        artist: song.artist,
        cover_url: song.cover_url,
        year: song.year || new Date().getFullYear(),
        genre: song.genre || 'Desconhecido'
      });
    }
  }

  if (song.artist) {
    const existingArtist = await db.artists.where({ user_id: song.user_id, name: song.artist }).first();
    if (!existingArtist) {
      await db.artists.put({
        id: 'art_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        user_id: song.user_id,
        name: song.artist,
        image_url: song.cover_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80'
      });
    }
  }

  return song;
}

export async function toggleSongFavorite(userId, songId) {
  const song = await db.songs.get(songId);
  if (!song) return false;
  const newFavState = !song.favorite;
  await db.songs.update(songId, { favorite: newFavState });

  if (newFavState) {
    await db.favorites.put({
      id: 'fav_' + songId,
      user_id: userId,
      song_id: songId,
      created_at: new Date().toISOString()
    });
  } else {
    await db.favorites.delete('fav_' + songId);
  }
  return newFavState;
}

export async function recordPlay(userId, songId, progress = 100) {
  const song = await db.songs.get(songId);
  if (song) {
    await db.songs.update(songId, {
      play_count: (song.play_count || 0) + 1,
      last_played: new Date().toISOString()
    });
  }
  await db.play_history.add({
    id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    user_id: userId,
    song_id: songId,
    played_at: new Date().toISOString(),
    progress: progress
  });
}

export async function getUserPlaylists(userId) {
  return await db.playlists.where('user_id').equals(userId).toArray();
}

export async function createPlaylist(userId, name, description = '', cover_url = '') {
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
  await db.playlists.put(playlist);
  return playlist;
}

export async function addSongToPlaylist(playlistId, songId) {
  const count = await db.playlist_songs.where('playlist_id').equals(playlistId).count();
  await db.playlist_songs.put({
    id: 'pls_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    playlist_id: playlistId,
    song_id: songId,
    position: count
  });
  await db.playlists.update(playlistId, { updated_at: new Date().toISOString() });
}

export async function getPlaylistSongs(playlistId) {
  const entries = await db.playlist_songs.where('playlist_id').equals(playlistId).sortBy('position');
  const songIds = entries.map(e => e.song_id);
  const songs = await db.songs.where('id').anyOf(songIds).toArray();
  // Maintain position order
  const songMap = new Map(songs.map(s => [s.id, s]));
  return songIds.map(id => songMap.get(id)).filter(Boolean);
}

export async function clearUserHistory(userId) {
  await db.play_history.where('user_id').equals(userId).delete();
}
