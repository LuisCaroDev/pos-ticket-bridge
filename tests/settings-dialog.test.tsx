import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/components/app/SettingsDialog";
import { I18nProvider } from "../src/contexts/I18nContext";

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

    expect(screen.getAllByText("Idioma")).toHaveLength(2);
    expect(screen.getByText("Inicio automático")).toBeTruthy();
    expect(screen.getByText("Conexión del Bridge")).toBeTruthy();
    expect(
      screen.getByRole("switch", {
        name: "Iniciar Bridge automáticamente",
      }),
    ).toBeTruthy();
    const save = screen.getByRole("button", { name: "Guardar ajustes" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByDisplayValue("9977"), {
      target: { value: "9988" },
    });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });
});
