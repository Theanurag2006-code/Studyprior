import { createDemoApi, createHttpApi, createLocalStore, createServerApi, type ServerApi, type StudyPriorApi } from './api';

export * from './api';
export const local = createLocalStore();
const demo = createDemoApi(local, {
  // Development-only test hook (?demoFail=1). Vite removes the condition from production builds.
  simulateFailure: () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('demoFail'),
});
const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
export const api: StudyPriorApi = base ? createHttpApi(base, (u, i) => fetch(u, i), demo) : demo;
/** Sign-in, personal data, messaging and admin calls. null in demo mode (no server configured). */
export const server: ServerApi | null = base ? createServerApi(base, (u, i) => fetch(u, i)) : null;
