import { useEffect, useState } from "react";

const FRAMES = ["✶", "✸", "✹", "✺", "✹", "✷"];
const FRAME_MS = 150;

/** Current spinner frame; the timer only runs while `active`. */
export function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [active]);
  return FRAMES[frame]!;
}
