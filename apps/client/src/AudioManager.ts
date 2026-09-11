const assets = import.meta.glob(['../../../audio/click_001.ogg', '../../../audio/select_001.ogg', '../../../audio/card-slide-1.ogg', '../../../audio/card-place-1.ogg', '../../../audio/card-shove-1.ogg', '../../../audio/card-fan-1.ogg', '../../../audio/switch1.ogg', '../../../audio/dice-shake-1.ogg', '../../../audio/impactMetal_light_000.ogg', '../../../audio/cards-pack-open-1.ogg', '../../../audio/card-slide-2.ogg', '../../../audio/tick_001.ogg', '../../../audio/confirmation_001.ogg', '../../../audio/chip-lay-1.ogg', '../../../audio/chips-collide-1.ogg'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const files = {
  ui_click: 'click_001', ui_select: 'select_001', card_hover: 'card-slide-1',
  card_place: 'card-place-1', card_remove: 'card-shove-1', page_turn: 'card-fan-1',
  lever_pull: 'switch1', reels_spin: 'dice-shake-1', reel_stop: 'impactMetal_light_000',
  pack_rip: 'cards-pack-open-1', card_flip: 'card-slide-2', case_tick: 'tick_001',
  case_win: 'confirmation_001', coins_spend: 'chip-lay-1', coins_win: 'chips-collide-1',
} as const;
export type Sound = keyof typeof files;

/** One context, decoded buffer cache and a bounded pool of simultaneous voices. */
export class AudioManager {
  private context?: AudioContext;
  private buffers = new Map<Sound, Promise<AudioBuffer | undefined>>();
  private voices = new Set<AudioBufferSourceNode>();
  private last = new Map<Sound, number>();
  private get enabled() { try { return localStorage.getItem('sound') !== 'off'; } catch { return true; } }
  private init() { return this.context ??= new AudioContext(); }
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
        const gain = ctx.createGain(); gain.gain.value = loop ? .18 : name === 'card_hover' ? .16 : .45;
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
    if (!enabled) { for (const voice of this.voices) voice.stop(); this.voices.clear(); }
  }
  install() {
    this.preload();
    const click = (event: MouseEvent) => {
      const button = (event.target as Element)?.closest('button');
      if (button && !button.disabled) this.play(button.closest('.shop-tabs') ? 'ui_select' : 'ui_click');
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }
}
export const audioManager = new AudioManager();
