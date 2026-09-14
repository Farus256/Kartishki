const assets = import.meta.glob(['../../../audio/click_001.ogg', '../../../audio/select_001.ogg', '../../../audio/card-slide-1.ogg', '../../../audio/card-place-1.ogg', '../../../audio/card-shove-1.ogg', '../../../audio/card-fan-1.ogg', '../../../audio/switch1.ogg', '../../../audio/dice-shake-1.ogg', '../../../audio/impactMetal_light_000.ogg', '../../../audio/drop_001.ogg', '../../../audio/cards-pack-open-1.ogg', '../../../audio/card-slide-2.ogg', '../../../audio/tick_001.ogg', '../../../audio/confirmation_001.ogg', '../../../audio/confirmation_004.ogg', '../../../audio/chip-lay-1.ogg', '../../../audio/chips-stack-1.ogg'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const files = {
  ui_click: 'click_001', ui_select: 'select_001', card_hover: 'card-slide-1',
  card_place: 'card-place-1', card_remove: 'card-shove-1', page_turn: 'card-fan-1',
  lever_pull: 'switch1', reels_spin: 'dice-shake-1', reel_stop: 'impactMetal_light_000', reel_land: 'drop_001',
  pack_rip: 'cards-pack-open-1', card_flip: 'card-slide-2', case_tick: 'tick_001',
  case_win: 'confirmation_001', slots_big: 'confirmation_004', coins_spend: 'chip-lay-1', coins_win: 'chips-stack-1',
} as const;
export type Sound = keyof typeof files;

function readUnit(key: string, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch { /* keep the default until storage works */ }
  return fallback;
}

/** One context, decoded buffer cache and a bounded pool of simultaneous voices. */
export class AudioManager {
  private context?: AudioContext;
  private buffers = new Map<Sound, Promise<AudioBuffer | undefined>>();
  private voices = new Set<AudioBufferSourceNode>();
  private last = new Map<Sound, number>();
  private sfxVol = readUnit('sfxVolume', 1);
  private musicVol = readUnit('musicVolume', 0.5);
  private playlist: string[] = [];
  private track = 0;
  private currentUrl = '';
  private menuWanted = false;
  private failedTracks = new Set<string>();
  private music?: HTMLAudioElement;
  private get enabled() { try { return localStorage.getItem('sound') !== 'off'; } catch { return true; } }
  get sfxVolume() { return this.sfxVol; }
  get musicVolume() { return this.musicVol; }
  private init() { return this.context ??= new AudioContext(); }
  private player() {
    if (this.music) return this.music;
    const node = new Audio();
    node.addEventListener('ended', () => this.nextMenuTrack());
    node.addEventListener('error', () => {
      this.failedTracks.add(this.currentUrl);
      if (this.playlist.some(url => !this.failedTracks.has(url))) this.nextMenuTrack();
    });
    this.music = node;
    return node;
  }
  preload() { for (const name of Object.keys(files) as Sound[]) void this.buffer(name); }
  private buffer(name: Sound) {
    if (!this.buffers.has(name)) this.buffers.set(name, (async () => {
      const response = await fetch(assets[`../../../audio/${files[name]}.ogg`]);
      if (!response.ok) throw new Error('Audio unavailable');
      return this.init().decodeAudioData(await response.arrayBuffer());
    })().catch(() => undefined));
    return this.buffers.get(name)!;
  }
  play(name: Sound, loop = false): () => void {
    let cancelled = false;
    let source: AudioBufferSourceNode | undefined;
    const stop = () => { cancelled = true; if (source) { source.stop(); this.voices.delete(source); source = undefined; } };
    if (!this.enabled) return stop;
    const now = performance.now();
    if (!loop && now - (this.last.get(name) ?? -Infinity) < 55) return stop;
    this.last.set(name, now);
    void (async () => {
      try {
        const ctx = this.init(); await ctx.resume(); const buffer = await this.buffer(name);
        if (cancelled || !this.enabled || !buffer) return;
        if (this.voices.size >= 16) { const oldest = this.voices.values().next().value!; oldest.stop(); this.voices.delete(oldest); }
        source = ctx.createBufferSource(); source.buffer = buffer; source.loop = loop;
        const gain = ctx.createGain();
        const soft = name === 'coins_win' || name === 'coins_spend' ? .14
          : name === 'card_hover' ? .16
          : name === 'reel_land' ? .135
          : name === 'case_tick' ? .225
          : .45;
        gain.gain.value = (loop ? (name === 'reels_spin' ? .09 : .18) : soft) * this.sfxVol;
        source.connect(gain).connect(ctx.destination); this.voices.add(source);
        const voice = source;
        voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); if (source === voice) source = undefined; };
        source.start();
      } catch { /* Audio must never interrupt an action. */ }
    })();
    return stop;
  }
  setEnabled(enabled: boolean) {
    try { localStorage.setItem('sound', enabled ? 'on' : 'off'); } catch { /* optional storage */ }
    if (!enabled) {
      for (const voice of this.voices) voice.stop(); this.voices.clear();
      this.pauseMusic();
    }
    else if (this.menuWanted) this.playMenu();
  }
  setSfxVolume(value: number) {
    this.sfxVol = Math.min(1, Math.max(0, value));
    try { localStorage.setItem('sfxVolume', String(this.sfxVol)); } catch { /* optional storage */ }
  }
  setMusicVolume(value: number) {
    this.musicVol = Math.min(1, Math.max(0, value));
    try { localStorage.setItem('musicVolume', String(this.musicVol)); } catch { /* optional storage */ }
    if (this.music) this.music.volume = this.musicVol;
    if (this.menuWanted) this.playMenu();
  }
  setMenuTracks(urls: string[]) {
    const same = urls.length === this.playlist.length && urls.every((url, i) => url === this.playlist[i]);
    this.playlist = urls;
    if (!same) { this.track = 0; this.currentUrl = ''; this.failedTracks.clear(); }
    if (this.menuWanted) this.playMenu();
  }
  playMenu() {
    this.menuWanted = true;
    if (!this.enabled || this.musicVol <= 0 || !this.playlist.some(url => !this.failedTracks.has(url))) { this.pauseMusic(); return; }
    const url = this.playlist[this.track % this.playlist.length]!;
    const node = this.player();
    if (this.currentUrl !== url) { this.currentUrl = url; node.src = url; }
    node.volume = this.musicVol;
    void node.play().catch(() => {});
  }
  stopMenu() { this.menuWanted = false; this.pauseMusic(); }
  private pauseMusic() { this.music?.pause(); }
  private nextMenuTrack() {
    if (!this.playlist.length) return;
    for (let i = 0; i < this.playlist.length; i++) {
      this.track = (this.track + 1) % this.playlist.length;
      if (!this.failedTracks.has(this.playlist[this.track]!)) break;
    }
    this.currentUrl = '';
    if (this.menuWanted) this.playMenu();
  }
  install() {
    this.preload();
    const click = (event: MouseEvent) => {
      const button = (event.target as Element)?.closest('button');
      if (button && !button.disabled) this.play(button.closest('.shop-tabs') ? 'ui_select' : 'ui_click');
    };
    const unlock = () => { if (this.menuWanted) this.playMenu(); };
    document.addEventListener('click', click);
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => { document.removeEventListener('click', click); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  }
}
export const audioManager = new AudioManager();
