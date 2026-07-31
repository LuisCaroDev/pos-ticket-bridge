import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  errorPayload,
  message,
  resolveLanguage,
  testPrintTexts,
  type SupportedLanguage,
} from "../i18n";
import { ConfigStore, suggestedHosts } from "./config-store";
import {
  checkConnection,
  discoverBluetooth,
  discoverNetwork,
  discoverUsb,
} from "./discovery";
import { openDrawer, printJob, testPrint } from "./printer";
import type { Diagnostic, Printer } from "./types";

const printSchema = z.object({
  printerId: z.string().min(1),
  job: z.object({
    version: z.number(),
    widthMm: z.union([z.literal(58), z.literal(80)]).optional(),
    reason: z.string().optional(),
    jobId: z.string().optional(),
    blocks: z.array(z.object({ type: z.string() }).passthrough()),
  }),
});
const isLocal = (origin: unknown, port: number) =>
  !origin ||
  origin === `http://localhost:${port}` ||
  origin === `http://127.0.0.1:${port}`;

export function createBridgeServer(
  store: ConfigStore,
  getActiveLanguage: () => SupportedLanguage = () =>
    resolveLanguage(store.get().language),
) {
  const app = Fastify({ logger: false });
  const diagnostics: Diagnostic[] = [];
  const lastTests = new Map<string, unknown>();
  const allowed = (origin: string | undefined) =>
    isLocal(origin, store.get().port) ||
    store.get().allowedOrigins.includes(origin || "");
  const sendError = (reply: any, statusCode: number, error: unknown) =>
    reply.code(statusCode).send({ ok: false, error: errorPayload(error) });

  app.register(cors, {
    origin: (origin, done) => done(null, allowed(origin)),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-agent-token"],
  });
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || request.url === "/health") return;
    if (
      request.url.startsWith("/api/") &&
      isLocal(request.headers.origin, store.get().port)
    )
      return;
    if (request.headers["x-agent-token"] !== store.get().token)
      return reply
        .code(401)
        .send({ ok: false, error: message("invalid_token") });
  });

  const status = async () => ({
    ok: true,
    version: "1.0.0",
    port: store.get().port,
    language: store.get().language,
    activeLanguage: getActiveLanguage(),
    allowedOrigins: store.get().allowedOrigins,
    configPath: store.path(),
    token: store.get().token,
    suggestedHosts: suggestedHosts(store.get().port),
    configured: store.configured(),
    diagnostics: diagnostics.slice(0, 20),
    printers: await Promise.all(
      store.get().printers.map(async (printer) => ({
        ...printer,
        runtime: {
          connection: await checkConnection(printer),
          lastTest: lastTests.get(printer.id) || null,
          lastDiagnostic:
            diagnostics.find((item) => item.printerId === printer.id) || null,
        },
      })),
    ),
  });
  const operation = async (
    printer: Printer,
    operationName: string,
    work: (hooks: {
      onEvent: (stage: string, detail?: Record<string, unknown>) => void;
    }) => Promise<void>,
  ) => {
    const entry: Diagnostic = {
      printerId: printer.id,
      operation: operationName,
      startedAt: new Date().toISOString(),
      ok: false,
      steps: [],
    };
    const started = Date.now();
    const hooks = {
      onEvent: (stage: string, detail: Record<string, unknown> = {}) =>
        entry.steps.push({ at: new Date().toISOString(), stage, ...detail }),
    };
    try {
      await work(hooks);
      entry.ok = true;
      entry.message = message("operation_completed");
    } catch (error) {
      entry.message = errorPayload(error);
      entry.cause = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      entry.finishedAt = new Date().toISOString();
      entry.durationMs = Date.now() - started;
      diagnostics.unshift(entry);
      diagnostics.splice(50);
    }
  };
  const test = async (id: string) => {
    const printer = store.find(id);
    try {
      await operation(printer, "test-print", (hooks) =>
        testPrint(
          printer,
          testPrintTexts(getActiveLanguage(), printer.nombre),
          hooks,
        ),
      );
      lastTests.set(id, {
        ok: true,
        at: new Date().toISOString(),
        message: message("test_sent"),
      });
      return { ok: true };
    } catch (error) {
      lastTests.set(id, {
        ok: false,
        at: new Date().toISOString(),
        message: errorPayload(error),
      });
      throw error;
    }
  };

  app.get("/health", async () => ({
    ok: true,
    version: "1.0.0",
    suggestedHosts: suggestedHosts(store.get().port),
    printers: store
      .get()
      .printers.map(({ id, nombre, tipo }) => ({ id, nombre, tipo })),
  }));
  app.get("/api/status", status);
  app.get("/api/config", async () => ({
    ok: true,
    config: store.publicConfig(),
  }));
  app.get("/api/diagnostics/recent", async () => ({
    ok: true,
    items: diagnostics,
  }));
  app.put("/api/config", async (request: any, reply) => {
    try {
      return { ok: true, config: store.settings(request.body || {}) };
    } catch (error) {
      return sendError(reply, 400, error);
    }
  });
  app.post("/api/printers", async (request: any, reply) => {
    try {
      return { ok: true, config: store.create(request.body || {}) };
    } catch (error) {
      return sendError(reply, 400, error);
    }
  });
  app.put("/api/printers/:id", async (request: any, reply) => {
    try {
      return {
        ok: true,
        config: store.update(request.params.id, request.body || {}),
      };
    } catch (error) {
      return sendError(reply, 400, error);
    }
  });
  app.delete("/api/printers/:id", async (request: any, reply) => {
    try {
      return { ok: true, ...store.remove(request.params.id) };
    } catch (error) {
      return sendError(reply, 400, error);
    }
  });
  app.post("/api/printers/:id/duplicate", async (request: any, reply) => {
    try {
      return { ok: true, config: store.duplicate(request.params.id) };
    } catch (error) {
      return sendError(reply, 400, error);
    }
  });
  app.post("/api/printers/discover/network", async () => ({
    ok: true,
    ...(await discoverNetwork()),
  }));
  app.post("/api/printers/discover/usb", async () => ({
    ok: true,
    ...(await discoverUsb()),
  }));
  app.post("/api/printers/discover/bluetooth", async () => ({
    ok: true,
    ...(await discoverBluetooth()),
  }));
  app.post("/api/printers/:id/test", async (request: any, reply) => {
    try {
      return await test(request.params.id);
    } catch (error) {
      return sendError(reply, 500, error);
    }
  });
  app.post("/api/printers/:id/open-drawer", async (request: any, reply) => {
    try {
      const printer = store.find(request.params.id);
      await operation(printer, "open-drawer", (hooks) =>
        openDrawer(printer, hooks),
      );
      return { ok: true };
    } catch (error) {
      return sendError(reply, 500, error);
    }
  });
  app.post("/print", async (request: any, reply) => {
    const parsed = printSchema.safeParse(request.body);
    if (!parsed.success)
      return sendError(reply, 400, { code: "invalid_request" });
    try {
      const printer = store.find(parsed.data.printerId);
      await operation(printer, "print-job", (hooks) =>
        printJob(printer, parsed.data.job, hooks),
      );
      return { ok: true };
    } catch (error) {
      return sendError(reply, 500, error);
    }
  });
  app.post("/open-drawer", async (request: any, reply) => {
    try {
      const printer = store.find(request.body?.printerId);
      await operation(printer, "open-drawer", (hooks) =>
        openDrawer(printer, hooks),
      );
      return { ok: true };
    } catch (error) {
      return sendError(reply, 500, error);
    }
  });
  app.post("/test/:printerId", async (request: any, reply) => {
    try {
      return await test(request.params.printerId);
    } catch (error) {
      return sendError(reply, 500, error);
    }
  });
  return {
    app,
    store,
    status,
    start: async () => app.listen({ port: store.get().port, host: "0.0.0.0" }),
    stop: () => app.close(),
  };
}
