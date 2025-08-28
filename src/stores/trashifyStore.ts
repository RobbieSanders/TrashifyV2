// Back-compat shim: some code referenced './src/trashifyStore'.
// The actual store lives in './src/store'. Re-export to satisfy stale imports.
export * from './store';
