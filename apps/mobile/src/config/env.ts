const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const rawCvFramePostUrl = process.env.EXPO_PUBLIC_CV_FRAME_POST_URL?.trim();
const rawCvModelFrameUrl = process.env.EXPO_PUBLIC_CV_MODEL_FRAME_URL?.trim();
const rawCvPostIntervalMs = Number(process.env.EXPO_PUBLIC_CV_POST_INTERVAL_MS);
const rawSourceDeviceId = process.env.EXPO_PUBLIC_SOURCE_DEVICE_ID?.trim();

const removeTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export const API_BASE_URL = removeTrailingSlash(rawBaseUrl || "http://127.0.0.1:8080");
export const CV_FRAME_POST_URL = rawCvFramePostUrl || `${API_BASE_URL}/api/cv/live-signal`;
export const CV_MODEL_FRAME_URL = rawCvModelFrameUrl ? removeTrailingSlash(rawCvModelFrameUrl) : null;

export const CV_POST_INTERVAL_MS =
  Number.isFinite(rawCvPostIntervalMs) && rawCvPostIntervalMs >= 250
    ? rawCvPostIntervalMs
    : 500;

export const CV_SOURCE_DEVICE_ID = rawSourceDeviceId || "iphone-rescuesight";
