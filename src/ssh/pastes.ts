const START = Buffer.from("\x1b[200~");
const END = Buffer.from("\x1b[201~");
/** How long a trailing partial start marker (often just the Esc key) waits for the rest. */
const PREFIX_MS = 10;
/** How long an unterminated paste waits for more input before it's sent as is. */
const PASTE_MS = 1000;

/** Length of the longest suffix of `buf` that is a proper prefix of `marker`. */
function partialMarker(buf: Buffer, marker: Buffer): number {
  for (let n = Math.min(buf.length, marker.length - 1); n > 0; n--) {
    if (buf.subarray(buf.length - n).equals(marker.subarray(0, n))) return n;
  }
  return 0;
}

/**
 * Passes terminal input through, except bracketed pastes, whose text goes through `rewrite`
 * first. Input that arrives while a rewrite is pending waits behind it, so order is kept.
 */
export class PasteRewriter {
  private buf = Buffer.alloc(0);
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly write: (data: Uint8Array) => void,
    private readonly rewrite: (text: string) => Promise<string>,
  ) {}

  feed(chunk: Uint8Array): void {
    clearTimeout(this.timer);
    this.buf = Buffer.concat([this.buf, chunk]);
    this.pump();
  }

  private pump(): void {
    while (!this.busy && this.buf.length) {
      const start = this.buf.indexOf(START);
      if (start === -1) {
        const keep = partialMarker(this.buf, START);
        this.send(this.buf.length - keep);
        if (keep) this.flushAfter(PREFIX_MS);
        return;
      }
      this.send(start);
      const end = this.buf.indexOf(END, START.length);
      if (end === -1) return this.flushAfter(PASTE_MS);
      const text = this.buf.subarray(START.length, end).toString("utf8");
      this.buf = this.buf.subarray(end + END.length);
      this.busy = true;
      this.rewrite(text)
        .catch(() => text)
        .then((out) => {
          this.write(Buffer.concat([START, Buffer.from(out), END]));
          this.busy = false;
          this.pump();
        });
    }
  }

  private send(n: number): void {
    if (n <= 0) return;
    this.write(this.buf.subarray(0, n));
    this.buf = this.buf.subarray(n);
  }

  private flushAfter(ms: number): void {
    this.timer = setTimeout(() => this.send(this.buf.length), ms);
  }
}
