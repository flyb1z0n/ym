import { describe, expect, test } from "bun:test";
import { latinKey, layoutVariants } from "../src/core/layouts.ts";

describe("latinKey", () => {
  test("maps Russian and Ukrainian letters to the QWERTY letter on the same key", () => {
    expect([..."йцукенгшщзфывапролдячсмить"].map(latinKey).join("")).toBe("qwertyuiopasdfghjklzxcvbnm");
    expect(latinKey("і")).toBe("s");
  });

  test("leaves Latin letters and keys outside the letter rows alone", () => {
    for (const char of ["c", "_", " ", "х", "ж", "б", "С"]) expect(latinKey(char)).toBe(char);
  });
});

describe("layoutVariants", () => {
  test("lists what each layout types on a Latin letter's key", () => {
    expect(layoutVariants("g")).toEqual(["п"]);
    expect(layoutVariants("s")).toEqual(["ы", "і"]);
  });
});
