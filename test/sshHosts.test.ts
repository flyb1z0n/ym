import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeHost, forgetHost, loadHosts, rememberHost, sshHostsFile } from "../src/ssh/hosts.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ym-ssh-hosts-"));
  process.env.YM_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.YM_HOME;
});

describe("saved ssh hosts", () => {
  test("nothing is saved at first", () => {
    expect(loadHosts()).toEqual([]);
  });

  test("hosts are listed most recently used first, and reusing one moves it up instead of duplicating it", () => {
    rememberHost(["-p", "2222", "devbox"], 1);
    rememberHost(["prod"], 2);
    expect(loadHosts().map((h) => h.args)).toEqual([["prod"], ["-p", "2222", "devbox"]]);

    rememberHost(["-p", "2222", "devbox"], 3);
    expect(loadHosts()).toEqual([
      { args: ["-p", "2222", "devbox"], lastUsed: 3 },
      { args: ["prod"], lastUsed: 2 },
    ]);
  });

  test("the same host with different options is a separate entry", () => {
    rememberHost(["devbox"], 1);
    rememberHost(["-p", "2222", "devbox"], 2);
    expect(loadHosts()).toHaveLength(2);
  });

  test("a forgotten host is removed", () => {
    rememberHost(["devbox"], 1);
    rememberHost(["prod"], 2);
    forgetHost(["devbox"]);
    expect(loadHosts().map((h) => h.args)).toEqual([["prod"]]);
  });

  test("malformed files and entries are ignored", () => {
    writeFileSync(sshHostsFile(), "not json");
    expect(loadHosts()).toEqual([]);

    writeFileSync(
      sshHostsFile(),
      JSON.stringify([{ args: [], lastUsed: 1 }, { args: ["ok"], lastUsed: 2 }, { args: [3], lastUsed: 3 }, null]),
    );
    expect(loadHosts()).toEqual([{ args: ["ok"], lastUsed: 2 }]);
  });

  test("describeHost splits the destination from the options before it", () => {
    expect(describeHost(["-p", "2222", "-i", "~/.ssh/key", "me@devbox"])).toEqual({
      destination: "me@devbox",
      options: "-p 2222 -i ~/.ssh/key",
    });
  });

  test("describeHost finds the destination when options follow it", () => {
    expect(describeHost(["me@devbox", "-p", "2222"])).toEqual({ destination: "me@devbox", options: "-p 2222" });
  });

  test("describeHost skips option values, whether attached, separate, or after grouped flags", () => {
    expect(describeHost(["-p2222", "-vA", "-o", "Port=22", "-Ci", "key", "devbox"]).destination).toBe("devbox");
    expect(describeHost(["--", "devbox"]).destination).toBe("devbox");
  });
});
