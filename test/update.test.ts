import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updatesDir } from "../src/core/paths.ts";
import {
  assetName,
  checkForUpdate,
  compareVersions,
  downloadUpdate,
  installUpdate,
  latestVersion,
  stagedUpdate,
} from "../src/core/update.ts";

const ASSET = assetName();
const sha256 = (data: string) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

/** Fake GitHub releases: `latest` and the per-version assets they serve. */
const releases = new Map<string, { binary: string; checksum?: string }>();
let latest = "0.1.5";
let server: ReturnType<typeof Bun.serve>;
let home: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/latest/download/version") return new Response(`${latest}\n`);
      const m = path.match(/^\/download\/v([^/]+)\/(.+)$/);
      const release = m && releases.get(m[1]!);
      if (!release) return new Response("not found", { status: 404 });
      if (m[2] === "checksums.txt") {
        return new Response(`${release.checksum ?? sha256(release.binary)}  ${ASSET}\n${sha256("x")}  ym-other-arch\n`);
      }
      if (m[2] === ASSET) return new Response(release.binary);
      return new Response("not found", { status: 404 });
    },
  });
  process.env.YM_UPDATE_URL = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  delete process.env.YM_UPDATE_URL;
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ym-update-"));
  process.env.YM_HOME = home;
  releases.clear();
  latest = "0.1.5";
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.YM_HOME;
});

describe("compareVersions", () => {
  test("orders versions numerically, not as text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.9", "0.1.10")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.99")).toBe(1);
    expect(compareVersions("0.1.5", "0.1.5")).toBe(0);
  });
});

describe("updates", () => {
  test("reads the latest version and rejects anything that isn't one", async () => {
    expect(await latestVersion()).toBe("0.1.5");
    latest = "<html>";
    await expect(latestVersion()).rejects.toThrow("unexpected release version");
  });

  test("downloads a release whose checksum matches and stages it as executable", async () => {
    releases.set("0.1.5", { binary: "new ym" });
    const update = await downloadUpdate("0.1.5");
    expect(update.version).toBe("0.1.5");
    expect(readFileSync(update.path, "utf8")).toBe("new ym");
    expect(statSync(update.path).mode & 0o111).toBeTruthy();
    expect(stagedUpdate("0.1.4")).toEqual(update);
  });

  test("refuses a release whose binary doesn't match its checksum", async () => {
    releases.set("0.1.5", { binary: "tampered", checksum: sha256("original") });
    await expect(downloadUpdate("0.1.5")).rejects.toThrow("doesn't match its checksum");
    expect(stagedUpdate("0.1.4")).toBeUndefined();
  });

  test("a new download replaces older staged releases", async () => {
    releases.set("0.1.5", { binary: "five" });
    releases.set("0.1.6", { binary: "six" });
    await downloadUpdate("0.1.5");
    await downloadUpdate("0.1.6");
    expect(readdirSync(updatesDir())).toEqual(["ym-0.1.6"]);
  });

  test("ignores staged releases that aren't newer than the running one", () => {
    mkdirSync(updatesDir(), { recursive: true });
    writeFileSync(join(updatesDir(), "ym-0.1.5"), "five");
    writeFileSync(join(updatesDir(), "ym-0.1.5.tmp"), "partial");
    expect(stagedUpdate("0.1.5")).toBeUndefined();
    expect(stagedUpdate("0.1.4")?.version).toBe("0.1.5");
  });

  test("checkForUpdate downloads only when the latest release is newer", async () => {
    releases.set("0.1.5", { binary: "five" });
    expect(await checkForUpdate("0.1.5")).toBeUndefined();
    expect(await checkForUpdate("0.1.6")).toBeUndefined();
    const update = await checkForUpdate("0.1.4");
    expect(update?.version).toBe("0.1.5");
    releases.clear();
    expect(await checkForUpdate("0.1.4")).toEqual(update!);
  });

  test("installUpdate swaps the binary in and clears the staged copy", async () => {
    releases.set("0.1.5", { binary: "new ym" });
    const update = await downloadUpdate("0.1.5");
    const target = join(home, "bin", "ym");
    mkdirSync(join(home, "bin"));
    writeFileSync(target, "old ym");
    installUpdate(update, target);
    expect(readFileSync(target, "utf8")).toBe("new ym");
    expect(statSync(target).mode & 0o111).toBeTruthy();
    expect(existsSync(update.path)).toBe(false);
    expect(readdirSync(join(home, "bin"))).toEqual(["ym"]);
  });
});
