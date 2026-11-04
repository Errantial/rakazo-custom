/** Shared by connection settings, reporting and the launch prefetch before the full API module can load. */
export const API_BASE_STORAGE_KEY = "rakazo.api_base";
export const SPACE_STORAGE_KEY = "rakazo.space_id";
export const SERVER_HEADERS_STORAGE_KEY = "rakazo.server_headers";
export const UI_LOCALE_STORAGE_KEY = "rakazo.uiLocale";
export const LOCAL_API = "http://127.0.0.1:3100";
export const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? LOCAL_API;
