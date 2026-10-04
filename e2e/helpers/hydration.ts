import type { Locator } from "@playwright/test";

/** Waits until React has attached its handlers to the element (i.e. the island is hydrated). */
export async function waitForHydration(locator: Locator) {
  await locator.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const check = () => (Object.keys(el).some((k) => k.startsWith("__reactProps")) ? resolve() : requestAnimationFrame(check));
        check();
      }),
  );
}
