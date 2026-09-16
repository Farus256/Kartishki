import { useEffect, useState, type CSSProperties } from 'react';

const FOTOS = Object.values(import.meta.glob('../../../../Foto/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})) as string[];

type Floater = { id: number; src: string; left: number; size: number; dur: number; delay: number; rest: number };

let nextId = 1;

function spawn(fotos: string[], delay = 0): Floater {
  return {
    id: nextId++,
    src: fotos[Math.floor(Math.random() * fotos.length)]!,
    left: 4 + Math.random() * 92,
    size: (140 + Math.random() * 90) / 2.5,
    dur: 16 + Math.random() * 14,
    delay,
    rest: 6 + Math.random() * 78,
  };
}

function seed(fotos: string[]): Floater[] {
  return Array.from({ length: 12 }, (_, i) => spawn(fotos, i < 3 ? 0 : Math.random() * 6));
}

/** Cut-out faces drift up behind the main menu: the picked card set's wallpaper, or the built-in /Foto ones. */
export function MenuFotoWallpaper({ fotos }: { fotos?: string[] }) {
  const source = fotos?.length ? fotos : FOTOS;
  const [tiles, setTiles] = useState(() => seed(source));
  useEffect(() => { setTiles(seed(source)); }, [source.join('|')]);
  if (!source.length) return null;
  return (
    <div className="menu-foto" data-testid="menu-foto" aria-hidden>
      {tiles.map(tile => (
        <img key={tile.id} src={tile.src} alt=""
          style={{
            '--x': `${tile.left}%`,
            '--h': `${tile.size}px`,
            '--dur': `${tile.dur}s`,
            '--delay': `${tile.delay}s`,
            '--rest': `${tile.rest}%`,
          } as CSSProperties}
          onAnimationEnd={() => setTiles(current => current.map(item => item.id === tile.id ? spawn(source) : item))} />
      ))}
    </div>
  );
}
