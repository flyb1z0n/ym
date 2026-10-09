import { describe, expect, test } from "bun:test";
import { Box, renderToString } from "ink";
import { createElement } from "react";
import { ConfirmDialog, dialogBounds } from "../src/ui/Dialog.tsx";

describe("dialogBounds", () => {
  test("centers a capped dialog in a normal terminal", () => {
    expect(dialogBounds(100, 30, 9)).toEqual({
      width: 64,
      height: 9,
      left: 18,
      top: 10,
    });
  });

  test("fits inside a small terminal", () => {
    expect(dialogBounds(24, 8, 9)).toEqual({
      width: 22,
      height: 6,
      left: 1,
      top: 1,
    });
  });

  test("renders a centered confirmation with safe default selection", () => {
    const dialog = createElement(ConfirmDialog, {
      title: "Delete session?",
      subject: "Test session",
      confirmLabel: "Delete",
      width: 80,
      height: 24,
      tone: "danger",
      onConfirm() {},
      onCancel() {},
    });
    const output = renderToString(createElement(Box, { width: 80, height: 24 }, dialog));

    expect(output).toContain("Delete session?");
    expect(output).toContain("Test session");
    expect(output).toContain("Delete");
    expect(output).toContain("Cancel");
  });
});
