export const MENU_MUSIC_MAX = 12;
export type MenuMusicTrack = { id: string; name: string; url: string };
export type MenuMusic = { tracks: MenuMusicTrack[] };
export const emptyMenuMusic: MenuMusic = { tracks: [] };

const TRACK_URL = /^\/api\/music\/[a-f0-9]{64}\.(mp3|mpeg|wav|ogg|webm)$/;

export function validateMenuMusic(data: unknown): data is MenuMusic {
  if (!data || typeof data !== 'object' || !Array.isArray((data as MenuMusic).tracks)) return false;
  const tracks = (data as MenuMusic).tracks;
  if (tracks.length > MENU_MUSIC_MAX) return false;
  const ids = new Set<string>();
  return tracks.every(track =>
    track && typeof track.id === 'string' && track.id.length >= 1 && track.id.length <= 60 && !ids.has(track.id)
    && (ids.add(track.id), typeof track.name === 'string' && track.name.trim().length > 0 && track.name.length <= 80)
    && typeof track.url === 'string' && TRACK_URL.test(track.url));
}

export function resolveMenuMusic(data: unknown): MenuMusic {
  return validateMenuMusic(data) ? data : emptyMenuMusic;
}
