/** Preserve uploaded bytes and derive a bounded, unfiltered display source. */
export async function uploadPortrait(file: File, endpoint: string): Promise<{ url: string; originalUrl: string }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8_000_000) throw new Error('invalidImage');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = objectUrl; await image.decode();
    if (image.width * image.height > 24_000_000) throw new Error('invalidImage');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d5cfc3'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', .85);
    if (url.length > 1_500_000) throw new Error('invalidImage');
    const response = await fetch(`${endpoint}/api/portraits`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    if (!response.ok) throw new Error('portraitUploadFailed');
    const saved: { path: string } = await response.json();
    return { url, originalUrl: `${endpoint}${saved.path}` };
  } finally { URL.revokeObjectURL(objectUrl); }
}
