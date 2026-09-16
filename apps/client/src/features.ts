/** Where the editor app lives: the Vite dev server next door, or a deployed copy under /editor/. */
export const EDITOR_URL: string = import.meta.env.VITE_EDITOR_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5174/' : '/editor/');
