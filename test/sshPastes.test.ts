import { describe, expect, test } from "bun:test";
import { PasteRewriter } from "../src/ssh/pastes.ts";

const S = "\x1b[200~";
const E = "\x1b[201~";

function rig(rewrite: (text: string) => Promise<string> = async (t) => t.toUpperCase()) {
  let out = "";
  const r = new PasteRewriter((d) => (out += Buffer.from(d).toString()), rewrite);
  return { feed: (s: string) => r.feed(Buffer.from(s)), out: () => out };
}

describe("PasteRewriter", () => {
  test("keys pass straight through", () => {
    const r = rig();
    r.feed("hello\r\x1b[A");
    expect(r.out()).toBe("hello\r\x1b[A");
  });

  test("a paste is rewritten, and the keys around it keep their order", async () => {
    const r = rig();
    r.feed(`a${S}path${E}b`);
    expect(r.out()).toBe("a");
    await Bun.sleep(0);
    expect(r.out()).toBe(`a${S}PATH${E}b`);
  });

  test("markers split across reads still delimit the paste", async () => {
    const r = rig();
    for (const part of ["x\x1b[2", "00~pa", "th\x1b[20", "1~y"]) r.feed(part);
    await Bun.sleep(0);
    expect(r.out()).toBe(`x${S}PATH${E}y`);
  });

  test("input typed while an upload is pending waits behind it", async () => {
    let finish!: (s: string) => void;
    const r = rig(() => new Promise((resolve) => (finish = resolve)));
    r.feed(`${S}shot.png${E}`);
    r.feed("typed");
    r.feed(`${S}second${E}`);
    expect(r.out()).toBe("");
    finish("/remote/shot.png");
    await Bun.sleep(0);
    expect(r.out()).toBe(`${S}/remote/shot.png${E}typed`);
    finish("SECOND");
    await Bun.sleep(0);
    expect(r.out()).toBe(`${S}/remote/shot.png${E}typed${S}SECOND${E}`);
  });

  test("a failed rewrite sends the paste unchanged", async () => {
    const r = rig(() => Promise.reject(new Error("nope")));
    r.feed(`${S}text${E}`);
    await Bun.sleep(0);
    expect(r.out()).toBe(`${S}text${E}`);
  });

  test("a lone Esc goes out once it can't be a paste marker", async () => {
    const r = rig();
    r.feed("\x1b");
    expect(r.out()).toBe("");
    await Bun.sleep(30);
    expect(r.out()).toBe("\x1b");
  });

  test("a paste that never ends is sent as is after a pause", async () => {
    const r = rig();
    r.feed(`${S}half`);
    expect(r.out()).toBe("");
    await Bun.sleep(1100);
    expect(r.out()).toBe(`${S}half`);
  });
});
