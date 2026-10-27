import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { SshHostPicker } from "../src/ui/SshHostPicker.tsx";

const now = Date.now();
const picker = (hosts: { args: string[]; lastUsed: number }[], width = 80) =>
  renderToString(<SshHostPicker hosts={hosts} width={width} height={5} onPick={() => {}} onForget={() => {}} />, {
    columns: width,
  });

describe("SshHostPicker", () => {
  test("shows the host, its options, and how long ago it was used, with the keys below", () => {
    const out = picker([{ args: ["devbox@kostiantyn-shavrukov.sandbox.qagr.io", "-p", "2222"], lastUsed: now - 6000 }]);
    expect(out).toContain("Connect to a saved host");
    expect(out).toContain("1 host");
    expect(out).toMatch(/› devbox@kostiantyn-shavrukov\.sandbox\.qagr\.io\s+-p 2222\s+6s ago/);
    expect(out).toContain("↑↓ select · Enter connect · Ctrl-X forget · Esc cancel");
  });

  test("keeps every row inside the border when hosts are too long to fit", () => {
    const out = picker(
      [
        { args: ["-o", "ProxyJump=bastion.example.com", `me@${"very-long-host-name.".repeat(4)}example.com`], lastUsed: now },
        { args: ["prod"], lastUsed: now - 3_600_000 },
      ],
      50,
    );
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(50);
    expect(out).toContain("2 hosts");
    expect(out).toContain("1h ago");
  });
});
