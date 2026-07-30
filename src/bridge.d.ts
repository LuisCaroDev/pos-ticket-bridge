export {};
declare global {
  interface Window {
    bridge: {
      platform: string;
      status(): Promise<any>;
      settings(input: any): Promise<any>;
      createPrinter(input: any): Promise<any>;
      updatePrinter(id: string, input: any): Promise<any>;
      deletePrinter(id: string): Promise<any>;
      duplicatePrinter(id: string): Promise<any>;
      discover(kind: "network" | "usb" | "bluetooth"): Promise<any>;
      request(route: string, method?: string, body?: any): Promise<any>;
      testPrinter(input: any): Promise<void>;
      copy(value: string): Promise<void>;
    };
  }
}
