import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Clipboard, XIcon } from "lucide-react";
import { translateMessage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBridge } from "./BridgeContext";
import { useI18n } from "./I18nContext";

type DiagnosticsTarget = {
  diagnostics?: any[];
  filter?: { printerId: string } | { draftSessionId: string };
  title?: string;
};

type PrintDiagnosticsContextValue = {
  openDiagnostics: (target: DiagnosticsTarget) => void;
};

const PrintDiagnosticsContext = createContext<
  PrintDiagnosticsContextValue | undefined
>(undefined);

const diagnosticDetails = (entry: Record<string, unknown>) =>
  Object.entries(entry)
    .filter(([key]) => key !== "at" && key !== "stage")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");

export function PrintDiagnosticsProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<DiagnosticsTarget>();
  const { copy, status } = useBridge();
  const { language, tr } = useI18n();
  const openDiagnostics = useCallback((next: DiagnosticsTarget) => {
    setTarget(next);
  }, []);
  const value = useMemo(() => ({ openDiagnostics }), [openDiagnostics]);
  const diagnostics = useMemo(() => {
    if (!target?.filter) return target?.diagnostics || [];
    const all = status?.diagnostics || [];
    if ("printerId" in target.filter)
      return all.filter(
        (entry: any) => entry.printerId === target.filter?.printerId,
      );
    return all.filter(
      (entry: any) => entry.draftSessionId === target.filter?.draftSessionId,
    );
  }, [status?.diagnostics, target]);

  return (
    <PrintDiagnosticsContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(undefined)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"
        >
          <Button
            className="absolute top-2 right-2"
            size="icon-sm"
            variant="ghost"
            aria-label={tr("close")}
            onClick={() => setTarget(undefined)}
          >
            <XIcon />
          </Button>
          <DialogHeader>
            <DialogTitle>{tr("print_diagnostics")}</DialogTitle>
            {target?.title && (
              <DialogDescription>{target.title}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!diagnostics.length}
                onClick={() => copy(JSON.stringify(diagnostics, null, 2))}
              >
                <Clipboard data-icon="inline-start" />
                {tr("copy")}
              </Button>
            </div>
            {diagnostics.length ? (
              diagnostics.map((entry: any, index: number) => (
                <Fragment key={`${entry.startedAt}-${index}`}>
                  {index > 0 && <Separator />}
                  <article>
                    <p
                      className={
                        entry.status === "warning"
                          ? "font-medium text-amber-700 dark:text-amber-300"
                          : entry.ok
                            ? "font-medium"
                            : "font-medium text-destructive"
                      }
                    >
                      {entry.status === "warning"
                        ? translateMessage(language, entry.message)
                        : entry.ok
                          ? tr("operation_completed")
                          : translateMessage(language, entry.message)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.operation} ·{" "}
                      {new Date(entry.startedAt).toLocaleString()} ·{" "}
                      {entry.durationMs || 0} ms
                    </p>
                    {entry.cause && (
                      <div className="mt-3">
                        <p className="text-xs font-medium">
                          {tr("diagnostic_cause")}
                        </p>
                        <code className="mt-1 block break-words bg-muted p-2 text-xs">
                          {entry.cause}
                        </code>
                      </div>
                    )}
                    {entry.steps?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium">
                          {tr("diagnostic_steps")}
                        </p>
                        <ol className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                          {entry.steps.map(
                            (
                              step: Record<string, unknown>,
                              stepIndex: number,
                            ) => (
                              <li
                                key={`${String(step.at)}-${stepIndex}`}
                                className="break-words"
                              >
                                <code>{String(step.stage)}</code>
                                {diagnosticDetails(step) &&
                                  ` · ${diagnosticDetails(step)}`}
                              </li>
                            ),
                          )}
                        </ol>
                      </div>
                    )}
                  </article>
                </Fragment>
              ))
            ) : (
              <p className="text-muted-foreground">
                {tr("no_print_diagnostics")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PrintDiagnosticsContext.Provider>
  );
}

export function usePrintDiagnostics() {
  const value = useContext(PrintDiagnosticsContext);
  if (!value) throw new Error("Print diagnostics context is unavailable.");
  return value;
}
