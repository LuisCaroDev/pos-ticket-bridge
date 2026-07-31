export {};
declare global {
  interface Window {
    bridge: {
      platform: string;
      status(): Promise<any>;
      settings(input: any): Promise<any>;
      createPrinter(input: any, draftSessionId?: string): Promise<any>;
      updatePrinter(id: string, input: any): Promise<any>;
      deletePrinter(id: string): Promise<any>;
      duplicatePrinter(id: string): Promise<any>;
      discover(kind: "network" | "usb" | "bluetooth"): Promise<any>;
      printerProfiles(input?: any): Promise<any>;
      compatibilityReport(input: any, diagnostic?: any): Promise<any>;
      request(route: string, method?: string, body?: any): Promise<any>;
      testPrinter(
        input: any,
        options?: {
          draftSessionId?: string;
          operation?: "test-draft" | "spanish-validation";
        },
      ): Promise<any>;
      discardDraftDiagnostics(draftSessionId: string): Promise<void>;
      copy(value: string): Promise<void>;
    };
  }
}
