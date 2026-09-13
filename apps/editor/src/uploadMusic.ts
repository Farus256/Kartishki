const TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'];

function mimeOf(file: File) {
  const raw = file.type.split(';')[0];
  if (TYPES.includes(raw)) return raw;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'mp3' || ext === 'mpeg') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'webm') return 'audio/webm';
  return '';
}

export async function uploadMusic(file: File, endpoint: string): Promise<string> {
  const type = mimeOf(file);
  if (!type || file.size > 8_000_000) throw new Error('invalidAudio');
  const response = await fetch(`${endpoint}/api/music`, { method: 'POST', headers: { 'Content-Type': type }, body: file });
  if (!response.ok) throw new Error('invalidAudio');
  const saved: { path: string } = await response.json();
  return saved.path;
}
