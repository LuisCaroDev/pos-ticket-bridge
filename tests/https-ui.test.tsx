import { BridgeAccessCards } from "../src/components/app/BridgeAccessCards";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type TranslationKey, type MessageParams } from "../src/i18n";
import type { LocalHttpsStatus } from "../src/core/local-https-types";
import { HttpsDeviceDialog } from "../src/components/app/HttpsDeviceDialog";
import { LocalHttpsSettings } from "../src/components/app/LocalHttpsSettings";

const mocks = vi.hoisted(() => ({
  status: {} as { localHttps: LocalHttpsStatus },
  perform: vi.fn(async (_name: string, work: () => Promise<unknown>) => work()),
  copy: vi.fn(),
  reportFailure: vi.fn(),
  qr: vi.fn(async () => "data:image/png;base64,aGVsbG8="),
}));
vi.mock("@/contexts/BridgeContext", () => ({
  useBridge: () => ({ ...mocks, busy: "" }),
}));
vi.mock("@/contexts/I18nContext", () => ({
  useI18n: () => ({
    language: "es",
    tr: (key: TranslationKey, params?: MessageParams) => t("es", key, params),
  }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qr } }));

const api = {
  platform: "win32",
  httpsTrust: vi.fn(),
  httpsActivate: vi.fn(),
  httpsPause: vi.fn(),
  httpsSelect: vi.fn(),
  httpsEnroll: vi.fn(),
  httpsStopEnrollment: vi.fn(async (): Promise<void> => undefined),
  httpsReset: vi.fn(),
  httpsVideos: vi.fn(
    async () =>
      ({}) as Partial<Record<"ios" | "android" | "windows" | "macos", boolean>>,
  ),
  httpsVideo: vi.fn(async () => undefined),
  httpsHealth: vi.fn(async () => undefined),
  httpsHelp: vi.fn(async (): Promise<void> => undefined),
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "bridge", { configurable: true, value: api });
  mocks.status = {
    localHttps: {
      state: "active",
      transport: "https",
      host: "https://192.168.10.12:9977",
      selection: { name: "Wi-Fi", address: "192.168.10.12" },
      interfaces: [
        {
          name: "Wi-Fi",
          address: "192.168.10.12",
          netmask: "255.255.255.0",
          mac: "00:01:02:03:04:05",
        },
      ],
      fingerprint: "AA:BB:CC",
    },
  };
});
afterEach(cleanup);

it("edits HTTPS as a draft without calling Electron", () => {
  const onChange = vi.fn();
  render(
    <LocalHttpsSettings
      status={mocks.status.localHttps}
      value={{ enabled: true, selection: mocks.status.localHttps.selection }}
      onChange={onChange}
      disabled={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("switch", { name: t("es", "https_enable") }),
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false }),
  );
  expect(api.httpsPause).not.toHaveBeenCalled();
  expect(api.httpsActivate).not.toHaveBeenCalled();
  expect(api.httpsSelect).not.toHaveBeenCalled();
});

describe("device setup assistant", () => {
  it("shows the selected OS guide and requests its public download only after clicking", async () => {
    render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(t("es", "https_guide_ios"))).toBeNull();
    expect(api.httpsEnroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Android" }));
    expect(screen.queryByText(t("es", "https_guide_android"))).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: t("es", "https_step_continue") }),
    );
    await waitFor(() =>
      expect(api.httpsEnroll).toHaveBeenCalledWith("android"),
    );
    expect(screen.getByText(t("es", "https_guide_android"))).toBeTruthy();
  });

  it("renders a certificate-only QR, expires it and closes downloads when dismissed", async () => {
    const url = "http://192.168.10.12:9978/setup/ios.mobileconfig";
    mocks.status.localHttps.enrollment = {
      os: "ios",
      url,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
    const view = render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: t("es", "https_step_continue") }),
    );
    await waitFor(() =>
      expect(screen.getByAltText(t("es", "https_qr_alt"))).toBeTruthy(),
    );
    expect(mocks.qr).toHaveBeenCalledWith(url, expect.any(Object));
    expect(screen.queryByText(/x-agent-token/)).toBeNull();
    mocks.status.localHttps.enrollment = {
      os: "ios",
      url,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    view.rerender(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByAltText(t("es", "https_qr_alt"))).toBeTruthy();
    expect(
      document.querySelector('[data-download-state="expired"]'),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: t("es", "https_qr_regenerate") }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: t("es", "https_qr_regenerate") }),
    );
    await waitFor(() => expect(api.httpsEnroll).toHaveBeenCalledTimes(2));
    mocks.status.localHttps.enrollment = {
      os: "ios",
      url,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
    view.rerender(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
    await screen.findByAltText(t("es", "https_qr_alt"));
    const stopped = api.httpsStopEnrollment.mock.calls.length;
    view.rerender(<HttpsDeviceDialog open={false} onOpenChange={vi.fn()} />);
    await waitFor(() =>
      expect(api.httpsStopEnrollment).toHaveBeenCalledTimes(stopped + 1),
    );
  });

  it("stops enrollment when the assistant unmounts", async () => {
    const view = render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
    view.unmount();
    await waitFor(() => expect(api.httpsStopEnrollment).toHaveBeenCalledOnce());
  });
});

it("hides technical details and stops the session when changing OS", async () => {
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  expect(screen.queryByText(t("es", "https_download_expired"))).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_continue") }),
  );
  const details = await screen.findByRole("button", {
    name: t("es", "https_technical_details"),
  });
  expect(details.getAttribute("aria-expanded")).toBe("false");
  expect(document.getElementById("https-ca-details")!.hidden).toBe(true);
  fireEvent.click(details);
  expect(document.getElementById("https-ca-details")!.hidden).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_back") }),
  );
  await screen.findByRole("button", { name: t("es", "https_step_continue") });
  expect(api.httpsStopEnrollment).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(t("es", "https_guide_ios"))).toBeNull();
});
it("does not open enrollment if dismissed while preparing", async () => {
  let finish!: () => void;
  api.httpsStopEnrollment.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_continue") }),
  );
  view.rerender(<HttpsDeviceDialog open={false} onOpenChange={vi.fn()} />);
  finish();
  await waitFor(() => expect(api.httpsStopEnrollment).toHaveBeenCalledTimes(2));
  expect(api.httpsEnroll).not.toHaveBeenCalled();
});

it("navigates through the visual stepper and exposes labeled OS logos", async () => {
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  for (const name of ["iOS", "Android", "Windows", "macOS"]) {
    expect(
      screen
        .getByRole("button", { name })
        .querySelector('svg[aria-hidden="true"]'),
    ).toBeTruthy();
  }
  const next = screen.getByRole("button", { name: /Escanear e instalar/ });
  fireEvent.click(next);
  await waitFor(() => expect(api.httpsEnroll).toHaveBeenCalledWith("ios"));
  await waitFor(() => expect(next.getAttribute("aria-current")).toBe("step"));
  expect(
    document.querySelector(
      '[data-slot="stepper-item"][data-state="completed"]',
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /1.*Sistema operativo/ }));
  await screen.findByRole("button", { name: "Android" });
  expect(api.httpsStopEnrollment).toHaveBeenCalledTimes(2);
});

it("offers trust repair on the connection card and hides it once trusted", async () => {
  mocks.status.localHttps.localTrust = "missing";
  const view = render(<BridgeAccessCards />);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_trust_retry") }),
  );
  await waitFor(() => expect(api.httpsTrust).toHaveBeenCalledOnce());
  mocks.status.localHttps.localTrust = "trusted";
  view.rerender(<BridgeAccessCards key="trusted" />);
  expect(
    screen.queryByRole("button", { name: t("es", "https_trust_retry") }),
  ).toBeNull();
});
it("routes the connection menu reset through the existing confirmation IPC", async () => {
  render(<BridgeAccessCards />);
  expect(
    screen.queryByRole("menuitem", { name: t("es", "https_reset") }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_actions") }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: t("es", "https_reset") }),
  );
  await waitFor(() => expect(api.httpsReset).toHaveBeenCalledOnce());
});

it("reserves QR space while generating, formats minutes and copies via icon", async () => {
  let finish!: (value: string) => void;
  mocks.qr.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const url = "http://192.168.10.12:9978/setup/ios.mobileconfig";
  mocks.status.localHttps.enrollment = {
    os: "ios",
    url,
    expiresAt: new Date(Date.now() + 568000).toISOString(),
  };
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_continue") }),
  );
  const loading = await screen.findByRole("status", {
    name: t("es", "https_qr_preparing"),
  });
  expect(loading.getAttribute("data-slot")).toBe("skeleton");
  expect(screen.queryByText(/Paso 2 de 2/)).toBeNull();
  await screen.findByText("Enlace disponible: 09:28");
  const copy = screen.getByRole("button", {
    name: t("es", "https_copy_download"),
  });
  expect(copy.textContent).toBe("");
  fireEvent.click(copy);
  expect(mocks.copy).toHaveBeenCalledWith(url);
  await act(async () => finish("data:image/png;base64,aGVsbG8="));
  await screen.findByAltText(t("es", "https_qr_alt"));
  expect(
    screen.queryByRole("status", { name: t("es", "https_qr_preparing") }),
  ).toBeNull();
});

it("shows configured videos and opens health through Electron", async () => {
  api.httpsVideos.mockResolvedValueOnce({ ios: true });
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_continue") }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: t("es", "https_video_help") }),
  );
  expect(api.httpsVideo).toHaveBeenCalledWith("ios");
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_guide_help") }),
  );
  expect(api.httpsHelp).toHaveBeenCalledWith("ios");
  fireEvent.click(
    screen.getByRole("link", {
      name: mocks.status.localHttps.host + "/health",
    }),
  );
  expect(api.httpsHealth).toHaveBeenCalledOnce();
  expect(
    screen.getByText(mocks.status.localHttps.host + "/health"),
  ).toBeTruthy();
});
it("keeps the official guide when no video is configured", async () => {
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_step_continue") }),
  );
  await screen.findByRole("link", {
    name: mocks.status.localHttps.host + "/health",
  });
  expect(
    screen.queryByRole("button", { name: t("es", "https_video_help") }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: t("es", "https_guide_help_only") }),
  );
  expect(api.httpsHelp).toHaveBeenCalledWith("ios");
});

it("shows the configured setup lifetime before generating the QR", () => {
  mocks.status.localHttps.enrollmentDurationMs = 1200000;
  render(<HttpsDeviceDialog open onOpenChange={vi.fn()} />);
  expect(
    screen.getByText(t("es", "https_step_os_hint", { time: "20:00" })),
  ).toBeTruthy();
});
