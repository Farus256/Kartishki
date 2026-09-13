import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';

function audioOk(mime: string | undefined, bytes: Buffer) {
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0);
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
  if (mime === 'audio/webm') return bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
  return false;
}

/** Menu tracks stay on disk so catalog JSON only stores paths. */
export function musicAssets() {
  const router = express.Router();
  const directory = resolve(dirname(process.env.CATALOG_FILE ?? 'data/catalog.json'), 'music');
  router.post('/', express.raw({ type: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'], limit: '8mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'invalidAudio' }); return; }
    const bytes = req.body;
    const mime = req.get('Content-Type')?.split(';')[0];
    if (!audioOk(mime, bytes)) { res.status(400).json({ error: 'invalidAudio' }); return; }
    const ext = mime === 'audio/mpeg' || mime === 'audio/mp3' ? 'mp3' : mime === 'audio/wav' || mime === 'audio/x-wav' ? 'wav' : mime === 'audio/ogg' ? 'ogg' : 'webm';
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
    mkdirSync(directory, { recursive: true });
    const target = resolve(directory, name);
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx' });
    res.json({ path: `/api/music/${name}` });
  });
  router.use(express.static(directory, { immutable: true, maxAge: '1y', fallthrough: false }));
  return router;
}
