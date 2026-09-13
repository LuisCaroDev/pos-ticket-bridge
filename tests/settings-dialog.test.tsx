import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/components/app/SettingsDialog";
import { I18nProvider } from "../src/contexts/I18nContext";

afterEach(cleanup);

describe("SettingsDialog", () => {
  it("keeps saving disabled until settings are dirty", () => {
    render(
      <I18nProvider>
        <SettingsDialog
          open
          busy={false}
          languageSetting="es"
          port="9977"
          origins=""
          autoStart
          showAutoStart
          onOpenChange={vi.fn()}
          onSave={vi.fn().mockResolvedValue(true)}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Aplicación")).toBeTruthy();

    expect(screen.getByText("Conexión del Bridge")).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "Iniciar Bridge automáticamente",
      }),
    ).toBeTruthy();
    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByDisplayValue("9977"), {
      target: { value: "9988" },
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });
});

const httpsStatus = {
  state: "active" as const,
  transport: "https" as const,
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
};
function settingsView(onSave: (input: any) => Promise<boolean>, open = true) {
  Object.defineProperty(window, "bridge", {
    configurable: true,
    value: { platform: "win32" },
  });
  return (
    <I18nProvider>
      <SettingsDialog
        open={open}
        busy={false}
        languageSetting="es"
        port="9977"
        origins=""
        autoStart={false}
        showAutoStart
        localHttps={httpsStatus}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    </I18nProvider>
  );
}
it("submits HTTPS and port together and retains edits on failure", async () => {
  const save = vi.fn().mockResolvedValue(false);
  render(settingsView(save));
  fireEvent.click(screen.getByRole("switch", { name: "Activar HTTPS local" }));
  fireEvent.change(screen.getByDisplayValue("9977"), {
    target: { value: "9988" },
  });
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/Conexión actual: HTTPS/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 9988,
        https: { enabled: false, selection: httpsStatus.selection },
      }),
    ),
  );
  await screen.findByText(/No se pudieron guardar/);
  expect(screen.getByDisplayValue("9988")).toBeTruthy();
});
it("discards all edits after closing and reopening", async () => {
  const save = vi.fn();
  const view = render(settingsView(save));
  fireEvent.click(screen.getByRole("switch", { name: "Activar HTTPS local" }));
  fireEvent.change(screen.getByDisplayValue("9977"), {
    target: { value: "9988" },
  });
  view.rerender(settingsView(save, false));
  view.rerender(settingsView(save, true));
  expect(screen.getByDisplayValue("9977")).toBeTruthy();
  expect(
    screen
      .getByRole("switch", { name: "Activar HTTPS local" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(save).not.toHaveBeenCalled();
});

it("names the dialog Settings and leaves repair actions outside the form", () => {
  render(settingsView(vi.fn()));
  expect(screen.getByRole("heading", { name: "Ajustes" })).toBeTruthy();
  expect(screen.queryByText("Avanzado")).toBeNull();
  expect(screen.queryByRole("button", { name: "Restablecer HTTPS local" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confiar en este equipo" })).toBeNull();
});
