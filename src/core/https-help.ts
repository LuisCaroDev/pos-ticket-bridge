import type { ClientOS } from "./local-https-types";

export const HTTPS_HELP_URLS: Record<ClientOS, string> = {
  ios: "https://support.apple.com/102390",
  android: "https://support.google.com/pixelphone/answer/2844832",
  windows:
    "https://learn.microsoft.com/en-us/windows-hardware/drivers/install/trusted-root-certification-authorities-certificate-store",
  macos:
    "https://support.apple.com/guide/keychain-access/change-the-trust-settings-of-a-certificate-kyca11871/mac",
};

// Only these public URLs are embedded at build time; runtime values may override them.
declare const __HTTPS_VIDEO_URLS__: Partial<Record<ClientOS, string>>;
export function httpsVideoUrl(
  os: ClientOS,
  environment: Record<string, string | undefined> = process.env,
): string | undefined {
  if (!["ios", "android", "windows", "macos"].includes(os)) return undefined;
  const defaults =
    typeof __HTTPS_VIDEO_URLS__ === "undefined" ? {} : __HTTPS_VIDEO_URLS__;
  const value =
    environment["POS_BRIDGE_HTTPS_VIDEO_" + os.toUpperCase()] ?? defaults[os];
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

// An unset or invalid override retains the official guide.
declare const __HTTPS_GUIDE_URLS__: Partial<Record<ClientOS, string>>;
export function httpsGuideUrl(
  os: ClientOS,
  environment: Record<string, string | undefined> = process.env,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(HTTPS_HELP_URLS, os))
    return undefined;
  const defaults =
    typeof __HTTPS_GUIDE_URLS__ === "undefined" ? {} : __HTTPS_GUIDE_URLS__;
  const value =
    environment["POS_BRIDGE_HTTPS_GUIDE_" + os.toUpperCase()] ?? defaults[os];
  try {
    const url = new URL(value?.trim() || HTTPS_HELP_URLS[os]);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {
    /* Fall back to the official guide. */
  }
  return HTTPS_HELP_URLS[os];
}
