const backgroundAssets = import.meta.glob('../../../Backgroundmusik/*.{mp3,MP3,ogg,OGG}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const builtInBackgroundTracks = Object.values(backgroundAssets);
