const cardVoiceAssets = import.meta.glob('../../../audio_cards/*.{mp3,MP3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const backgroundAssets = import.meta.glob('../../../Backgroundmusik/*.{mp3,MP3,ogg,OGG}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const cardVoiceTracks = Object.values(cardVoiceAssets);
export const builtInBackgroundTracks = Object.values(backgroundAssets);
