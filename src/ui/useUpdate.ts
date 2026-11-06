import { useEffect, useState } from "react";
import { checkForUpdate, logUpdate, stagedUpdate, updateBlocker, type Update } from "../core/update.ts";

/** Lets the dashboard draw before the first check. */
const FIRST_CHECK_MS = 10_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** The downloaded release waiting to replace this ym; checks for a newer one now and then. */
export function useUpdate(): Update | undefined {
  const [update, setUpdate] = useState(() => (updateBlocker() ? undefined : stagedUpdate()));
  useEffect(() => {
    if (updateBlocker()) return;
    const check = () =>
      checkForUpdate()
        .then((u) => {
          if (u) setUpdate(u);
        })
        .catch((e: Error) => logUpdate(`check failed: ${e.message}`));
    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return update;
}
