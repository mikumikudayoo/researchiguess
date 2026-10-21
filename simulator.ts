/** Explicit migration guard: the immutable historical code is under legacy/a37d1d5/. */
throw new Error(
  'The ambiguous root simulator entry point is retired. ' +
  'For preserved audited behavior use: bun run legacy:simulate -- results/NEW_LEGACY_RUN. ' +
  'For corrected synthetic behavior use: bun run simulate -- results/NEW_CORRECTED_RUN. ' +
  'For dynamic flow use: bun run simulate:dynamics -- results/NEW_DYNAMIC_RUN. ' +
  'These are different evidence categories; no historical results are replaced.',
);
export {};
