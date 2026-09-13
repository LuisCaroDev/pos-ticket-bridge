import type { BridgeMessage } from "../i18n";

export type HttpsState = "unconfigured" | "active" | "paused";
export type ClientOS = "ios" | "android" | "windows" | "macos";
export type NetworkSelection = { name: string; address: string };
export type LanInterface = NetworkSelection & { netmask: string; mac: string };
export type EnrollmentStatus = { url: string; expiresAt: string; os: ClientOS };
export type LocalHttpsStatus = {
  localTrust?: import("./local-ca-trust").TrustState;
  state: HttpsState;
  transport: "http" | "https" | "stopped";
  selection?: NetworkSelection;
  interfaces: LanInterface[];
  host: string;
  expiresAt?: string;
  caExpiresAt?: string;
  fingerprint?: string;
  error?: BridgeMessage;
  enrollmentDurationMs?: number;
  enrollment?: EnrollmentStatus;
};

export type LocalHttpsDraft = {
  enabled: boolean;
  selection?: NetworkSelection;
};
