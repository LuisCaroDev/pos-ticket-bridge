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
      exportLocalProfile(input: any): Promise<any>;
      importLocalProfile(input: any): Promise<any>;
      saveLocalProfile(input: any): Promise<any>;
      deleteLocalProfile(id: string): Promise<any>;
      validateCharacterProfileTestSet(input: any): Promise<any>;
      request(route: string, method?: string, body?: any): Promise<any>;
      testPrinter(
        input: any,
        options?: {
          draftSessionId?: string;
        },
      ): Promise<any>;
      runCharacterProfileTrial(
        input: any,
        candidate: { id: string; encoding: string; codeTable: number },
        draftSessionId?: string,
      ): Promise<any>;
      discardDraftDiagnostics(draftSessionId: string): Promise<void>;
      copy(value: string): Promise<void>;
      paste(): Promise<string>;
    };
  }
}
