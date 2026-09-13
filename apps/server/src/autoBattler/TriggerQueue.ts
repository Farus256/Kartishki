/** FIFO effect execution; nested hooks append work instead of recursing. */
export class TriggerQueue {
  private work: (() => void)[] = [];
  private draining = false;
  exhausted = false;
  constructor(private readonly limit = 1024) {}
  push(effect: () => void) { if (!this.exhausted) this.work.push(effect); }
  drain() {
    if (this.draining || this.exhausted) return;
    this.draining = true;
    let count = 0;
    try {
      while (this.work.length && count++ < this.limit) this.work.shift()!();
      if (this.work.length) { this.exhausted = true; this.work = []; }
    } finally { this.draining = false; }
  }
}
