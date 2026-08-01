import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  LoaderCircle,
  Play,
  Plus,
  ScrollText,
  XIcon,
} from "lucide-react";
import {
  defaultCharacterProfileTestSet,
  parseCharacterProfileTestSet,
  type CharacterProfileCandidate,
  type CharacterProfileTestSet,
} from "@/core/character-profile-tests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";

type CharacterProfileAssistantProps = {
  busy: boolean;
  brand: string;
  model: string;
  onBrandChange: (brand: string) => void;
  onModelChange: (model: string) => void;
  onRunTrial: (candidate: CharacterProfileCandidate) => Promise<boolean>;
  onValidate: (
    testSet: CharacterProfileTestSet,
  ) => Promise<CharacterProfileTestSet | undefined>;
  onConfirm: (
    testSet: CharacterProfileTestSet,
    candidate: CharacterProfileCandidate,
  ) => Promise<boolean>;
  onViewDiagnostics: () => void;
  onCopyPrompt: (model: string) => void;
};

type Step = "details" | "tests";
type Tab = "tests" | "edit";
type TrialStatus = "pending" | "printing" | "sent" | "error";

export function CharacterProfileAssistant({
  busy,
  brand,
  model,
  onBrandChange,
  onModelChange,
  onRunTrial,
  onValidate,
  onConfirm,
  onViewDiagnostics,
  onCopyPrompt,
}: CharacterProfileAssistantProps) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [tab, setTab] = useState<Tab>("tests");
  const [customTestSet, setCustomTestSet] = useState<
    CharacterProfileTestSet | undefined
  >();
  const [activeSet, setActiveSet] = useState<"default" | "custom">("default");
  const [pastedSet, setPastedSet] = useState("");
  const [importError, setImportError] = useState("");
  const [trialStatuses, setTrialStatuses] = useState<
    Record<string, TrialStatus>
  >({});
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [runningCandidateId, setRunningCandidateId] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStopped, setBatchStopped] = useState(false);
  const canTest = Boolean(brand.trim() && model.trim());
  const testSet =
    activeSet === "custom" && customTestSet
      ? customTestSet
      : defaultCharacterProfileTestSet;
  const isRunning = Boolean(runningCandidateId) || batchRunning;

  const candidateKey = (
    set: CharacterProfileTestSet,
    item: CharacterProfileCandidate,
  ) => `${set.name}:${item.id}`;
  const candidateLabel = (item: CharacterProfileCandidate, index: number) =>
    tr("character_profile_test_label", { number: index + 1, id: item.id });
  const statusLabel = (status: TrialStatus) => {
    if (status === "printing") return tr("character_profile_status_printing");
    if (status === "sent") return tr("character_profile_status_sent");
    if (status === "error") return tr("character_profile_status_error");
    return tr("character_profile_status_pending");
  };
  const resetSession = () => {
    setCustomTestSet(undefined);
    setActiveSet("default");
    setPastedSet("");
    setImportError("");
    setTrialStatuses({});
    setSelectedCandidateId("");
    setRunningCandidateId("");
    setBatchRunning(false);
    setBatchStopped(false);
    setTab("tests");
  };
  const closeAssistant = () => {
    setOpen(false);
    resetSession();
  };
  const openAssistant = () => {
    resetSession();
    setStep(canTest ? "tests" : "details");
    setOpen(true);
  };
  const changeSet = (next: "default" | "custom") => {
    setActiveSet(next);
    setSelectedCandidateId("");
    setBatchStopped(false);
  };
  const setStatus = (item: CharacterProfileCandidate, status: TrialStatus) =>
    setTrialStatuses((current) => ({
      ...current,
      [candidateKey(testSet, item)]: status,
    }));
  const runCandidate = async (item: CharacterProfileCandidate) => {
    setRunningCandidateId(item.id);
    setStatus(item, "printing");
    try {
      const succeeded = await onRunTrial(item);
      setStatus(item, succeeded ? "sent" : "error");
      return succeeded;
    } catch {
      setStatus(item, "error");
      return false;
    } finally {
      setRunningCandidateId("");
    }
  };
  const importSet = async () => {
    try {
      const next = parseCharacterProfileTestSet(JSON.parse(pastedSet));
      const validated = await onValidate(next);
      if (!validated) throw new Error("test set validation failed");
      setCustomTestSet(validated);
      setActiveSet("custom");
      setTab("tests");
      setTrialStatuses({});
      setSelectedCandidateId("");
      setBatchStopped(false);
      setImportError("");
    } catch {
      setImportError(tr("character_profile_import_error"));
    }
  };
  const runBatch = async () => {
    setBatchRunning(true);
    setBatchStopped(false);
    for (const item of testSet.candidates) {
      if (!(await runCandidate(item))) {
        setBatchStopped(true);
        break;
      }
    }
    setBatchRunning(false);
  };
  const confirm = async () => {
    const candidate = testSet.candidates.find(
      (item) => item.id === selectedCandidateId,
    );
    if (candidate && (await onConfirm(testSet, candidate))) closeAssistant();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        title={tr("character_profile_assistant")}
        aria-label={tr("character_profile_assistant")}
        onClick={openAssistant}
      >
        <Plus />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : closeAssistant())}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl"
        >
          <Button
            className="absolute top-2 right-2"
            size="icon-sm"
            variant="ghost"
            aria-label={tr("close")}
            onClick={closeAssistant}
          >
            <XIcon />
          </Button>
          <DialogHeader>
            <DialogTitle>{tr("character_profile_assistant")}</DialogTitle>
            <DialogDescription>
              {tr("character_profile_assistant_description")}
            </DialogDescription>
          </DialogHeader>
          {step === "details" ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  {tr("reported_brand")}
                  <Input
                    value={brand}
                    placeholder={tr("reported_brand")}
                    onChange={(event) => onBrandChange(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  {tr("reported_model")}
                  <Input
                    value={model}
                    placeholder={tr("reported_model")}
                    onChange={(event) => onModelChange(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!canTest}
                  onClick={() => setStep("tests")}
                >
                  {tr("character_profile_continue")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "tests" ? "default" : "ghost"}
                  aria-selected={tab === "tests"}
                  onClick={() => setTab("tests")}
                >
                  {tr("character_profile_tests_tab")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tab === "edit" ? "default" : "ghost"}
                  aria-selected={tab === "edit"}
                  onClick={() => setTab("edit")}
                >
                  {tr("character_profile_edit_set_tab")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setStep("details")}
                >
                  <ChevronLeft />
                  {tr("character_profile_back_to_details")}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={tr("print_diagnostics")}
                  title={tr("print_diagnostics")}
                  onClick={onViewDiagnostics}
                >
                  <ScrollText />
                </Button>
              </div>
              {tab === "tests" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      {tr("character_profile_select_set")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          activeSet === "default" ? "secondary" : "outline"
                        }
                        disabled={isRunning}
                        onClick={() => changeSet("default")}
                      >
                        {tr("character_profile_default_set")}
                      </Button>
                      {customTestSet && (
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            activeSet === "custom" ? "secondary" : "outline"
                          }
                          disabled={isRunning}
                          onClick={() => changeSet("custom")}
                        >
                          {customTestSet.name}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-md border">
                    {testSet.candidates.map((item, index) => {
                      const key = candidateKey(testSet, item);
                      const status = trialStatuses[key] || "pending";
                      const label = candidateLabel(item, index);
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 border-b p-3 last:border-b-0"
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="radio"
                              name="character-profile-candidate"
                              className="size-4 accent-primary"
                              aria-label={tr("character_profile_mark_correct", {
                                test: label,
                              })}
                              checked={selectedCandidateId === item.id}
                              disabled={isRunning || busy}
                              onChange={() => setSelectedCandidateId(item.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{label}</p>
                              <p
                                className="text-xs text-muted-foreground"
                                title={tr(
                                  "character_profile_technical_details",
                                  {
                                    encoding: item.encoding,
                                    table: item.codeTable,
                                  },
                                )}
                              >
                                {statusLabel(status)}
                              </p>
                            </div>
                          </label>
                          {status === "sent" && (
                            <CheckCircle2 className="size-4 text-primary" />
                          )}
                          {status === "error" && (
                            <CircleAlert className="size-4 text-destructive" />
                          )}
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label={tr("character_profile_print_test", {
                              test: label,
                            })}
                            title={tr("character_profile_print_test", {
                              test: label,
                            })}
                            disabled={busy || isRunning}
                            onClick={(event) => {
                              event.preventDefault();
                              void runCandidate(item);
                            }}
                          >
                            {status === "printing" ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Play />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  {batchStopped && (
                    <p className="text-sm text-destructive">
                      {tr("character_profile_batch_stopped")}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || isRunning}
                      onClick={() => void runBatch()}
                    >
                      <Play />
                      {tr("character_profile_batch")}
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || isRunning || !selectedCandidateId}
                      onClick={() => void confirm()}
                    >
                      {tr("character_profile_confirm_selection")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Field data-invalid={Boolean(importError) || undefined}>
                    <FieldLabel htmlFor="character-profile-import">
                      {tr("character_profile_import_label")}
                    </FieldLabel>
                    <Textarea
                      id="character-profile-import"
                      className="min-h-28"
                      value={pastedSet}
                      placeholder={tr("character_profile_import_placeholder")}
                      aria-invalid={Boolean(importError)}
                      onChange={(event) => setPastedSet(event.target.value)}
                    />
                    {importError && <FieldError>{importError}</FieldError>}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || isRunning}
                      onClick={() => void importSet()}
                    >
                      {tr("character_profile_import")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || isRunning}
                      onClick={() => onCopyPrompt(`${brand} ${model}`.trim())}
                    >
                      {tr("character_profile_copy_ai_prompt")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
