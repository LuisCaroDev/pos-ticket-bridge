import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AndroidLogo, AppleLogo, WindowsLogo } from "@phosphor-icons/react";
import { ArrowRight, ArrowLeft, QrCode, Check, Copy } from "lucide-react";
import {
  Stepper,
  StepperList,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperLabel,
} from "@/components/ui/stepper";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { ClientOS, LocalHttpsStatus } from "@/core/local-https-types";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";
import { translateMessage } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";

const formatDuration = (milliseconds: number) => {
  const seconds = Math.ceil(milliseconds / 1000);
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
};

const systems = {
  ios: { label: "iOS", Icon: AppleLogo },
  android: { label: "Android", Icon: AndroidLogo },
  windows: { label: "Windows", Icon: WindowsLogo },
  macos: { label: "macOS", Icon: AppleLogo },
};

export function HttpsDeviceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { status, busy, perform, copy, reportFailure } = useBridge();
  const { tr, language } = useI18n();
  const https: LocalHttpsStatus | undefined = status?.localHttps;
  const [videos, setVideos] = useState<Partial<Record<ClientOS, boolean>>>({});
  const [os, setOS] = useState<ClientOS>("ios");
  const [step, setStep] = useState<"os" | "qr">("os");
  const [pending, setPending] = useState(false);
  const [details, setDetails] = useState(false);
  const [lastUrl, setLastUrl] = useState("");
  const [qr, setQR] = useState("");
  const [now, setNow] = useState(Date.now());
  const wasOpen = useRef(false);
  const generation = useRef(0);
  const session = https?.enrollment;
  const seconds = session
    ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - now) / 1000))
    : 0;
  const sessionUrl =
    open && step === "qr" && seconds > 0 && session?.os === os
      ? session.url
      : undefined;

  const displayUrl = sessionUrl || lastUrl;
  useEffect(() => {
    if (sessionUrl) setLastUrl(sessionUrl);
  }, [sessionUrl]);

  useEffect(() => {
    if (!open) {
      setStep("os");
      setLastUrl("");
      setDetails(false);
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);
  useEffect(() => {
    let cancelled = false;
    setQR("");
    if (displayUrl)
      void QRCode.toDataURL(displayUrl, {
        width: 224,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (!cancelled) setQR(value);
        })
        .catch(reportFailure);
    return () => {
      cancelled = true;
    };
  }, [displayUrl, reportFailure]);
  useEffect(() => {
    if (wasOpen.current && !open)
      void window.bridge.httpsStopEnrollment().catch(reportFailure);
    if (wasOpen.current !== open) generation.current += 1;
    wasOpen.current = open;
  }, [open, reportFailure]);
  useEffect(
    () => () => {
      if (wasOpen.current)
        void window.bridge.httpsStopEnrollment().catch((): void => undefined);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.bridge
      .httpsVideos()
      .then((value) => {
        if (!cancelled) setVideos(value);
      })
      .catch(() => {
        if (!cancelled) setVideos({});
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  async function back() {
    await perform("https-back", async () => {
      await window.bridge.httpsStopEnrollment();
      setStep("os");
      setDetails(false);
    });
  }
  async function begin() {
    if (pending) return;
    const current = generation.current;
    setPending(true);
    try {
      await perform("https-enroll", async () => {
        await window.bridge.httpsStopEnrollment();
        if (!wasOpen.current || current !== generation.current) return;
        await window.bridge.httpsEnroll(os);
        if (wasOpen.current && current === generation.current) {
          setNow(Date.now());
          setStep("qr");
        }
      });
    } finally {
      setPending(false);
    }
  }
  if (!https) return null;
  const [validationBefore, validationAfter] = tr("https_validate_instruction", {
    url: "{url}",
  }).split("{url}");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tr("https_setup")}</DialogTitle>
          <DialogDescription>{tr("https_setup_description")}</DialogDescription>
        </DialogHeader>

        <Stepper
          value={step}
          steps={[{ value: "os" }, { value: "qr" }]}
          onValueChange={(value) => {
            if (pending || busy || value === step) return;
            if (value === "qr") void begin();
            else void back();
          }}
        >
          <StepperList aria-label={tr("https_setup")}>
            <StepperItem
              value="os"
              completed={step === "qr"}
              disabled={Boolean(busy) || pending}
              defaultTrigger={false}
            >
              <StepperTrigger>
                <StepperIndicator>
                  {step === "qr" ? <Check aria-hidden="true" /> : 1}
                </StepperIndicator>
                <StepperLabel>{tr("https_os")}</StepperLabel>
              </StepperTrigger>
            </StepperItem>
            <StepperItem
              value="qr"
              disabled={Boolean(busy) || pending || https.transport !== "https"}
              defaultTrigger={false}
            >
              <StepperTrigger>
                <StepperIndicator>
                  <QrCode aria-hidden="true" />
                </StepperIndicator>
                <StepperLabel>{tr("https_scan_install")}</StepperLabel>
              </StepperTrigger>
            </StepperItem>
          </StepperList>
        </Stepper>
        <FieldGroup>
          {step === "os" ? (
            <Field>
              <FieldLabel id="https-os-label">{tr("https_os")}</FieldLabel>
              <ToggleGroup
                aria-labelledby="https-os-label"
                variant="outline"
                className="grid w-full grid-cols-2 sm:grid-cols-4"
                value={[os]}
                disabled={Boolean(busy) || pending}
                onValueChange={(values) => {
                  if (values[0]) setOS(values[0] as ClientOS);
                }}
              >
                {Object.entries(systems).map(([value, { label, Icon }]) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-auto flex-col gap-2 py-4"
                  >
                    <Icon aria-hidden="true" weight="fill" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                {tr("https_step_os_hint", {
                  time: formatDuration(https.enrollmentDurationMs ?? 600000),
                })}
              </FieldDescription>
            </Field>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                <p className="text-center text-sm">
                  {tr("https_scan_from_device")}
                </p>
                <div
                  className="relative w-full"
                  data-download-state={
                    pending ? "preparing" : sessionUrl ? "active" : "expired"
                  }
                >
                  <div
                    className={cn(
                      "flex flex-col items-center gap-3",
                      (pending || !sessionUrl) &&
                        "pointer-events-none select-none opacity-25",
                    )}
                    aria-hidden={!sessionUrl || pending ? true : undefined}
                  >
                    {qr ? (
                      <img
                        src={qr}
                        width={224}
                        height={224}
                        alt={tr("https_qr_alt")}
                      />
                    ) : (
                      <Skeleton
                        className="size-56"
                        role="status"
                        aria-label={tr("https_qr_preparing")}
                      />
                    )}
                    <p className="text-center text-sm text-muted-foreground">
                      {tr("https_open_link_alternative")}
                    </p>
                    <div className="flex min-h-8 max-w-full items-center justify-center gap-2">
                      {displayUrl ? (
                        <code className="min-w-0 break-all text-sm">
                          {displayUrl}
                        </code>
                      ) : (
                        <Skeleton className="h-8 w-64" />
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={pending || !sessionUrl}
                        aria-label={tr("https_copy_download")}
                        title={tr("https_copy_download")}
                        onClick={() => {
                          if (sessionUrl) copy(sessionUrl);
                        }}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                    </div>
                    <p role="status">
                      {tr("https_download_time", {
                        time: formatDuration(seconds * 1000),
                      })}
                    </p>
                  </div>
                  {(pending || !sessionUrl) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-4 shadow-sm">
                        <p role="status">
                          {tr(
                            pending
                              ? "https_qr_preparing"
                              : "https_download_expired",
                          )}
                        </p>
                        <Button
                          disabled={
                            Boolean(busy) ||
                            pending ||
                            https.transport !== "https"
                          }
                          onClick={() => void begin()}
                        >
                          {tr("https_qr_regenerate")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-muted-foreground">
                {tr(`https_guide_${os}`)
                  .split("\n")
                  .map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                {https.host && https.transport === "https" && (
                  <li>
                    {validationBefore}
                    <a
                      href={`${https.host}/health`}
                      className="break-all underline underline-offset-4"
                      onClick={(event) => {
                        event.preventDefault();
                        void window.bridge.httpsHealth().catch(reportFailure);
                      }}
                    >
                      {https.host}/health
                    </a>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="ml-1 align-middle"
                      aria-label={tr("https_copy_health")}
                      title={tr("https_copy_health")}
                      onClick={() => copy(`${https.host}/health`)}
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                    {validationAfter}
                  </li>
                )}
              </ol>
              <p className="text-center text-sm">
                {tr("https_help_intro")}{" "}
                {videos[os] && (
                  <>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() =>
                        void window.bridge.httpsVideo(os).catch(reportFailure)
                      }
                    >
                      {tr("https_video_help")}
                    </Button>{" "}
                    {tr("https_help_or")}{" "}
                  </>
                )}
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() =>
                    void window.bridge.httpsHelp(os).catch(reportFailure)
                  }
                >
                  {tr(
                    videos[os] ? "https_guide_help" : "https_guide_help_only",
                  )}
                </Button>
              </p>
              {https.fingerprint && (
                <Field>
                  <Button
                    variant="ghost"
                    aria-expanded={details}
                    aria-controls="https-ca-details"
                    onClick={() => setDetails(!details)}
                  >
                    {tr("https_technical_details")}
                  </Button>
                  <div id="https-ca-details" hidden={!details}>
                    <FieldLabel>{tr("https_fingerprint")}</FieldLabel>
                    <code className="break-all text-xs">
                      {https.fingerprint}
                    </code>
                  </div>
                </Field>
              )}
            </>
          )}
          {https.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {translateMessage(language, https.error)}
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
        <DialogFooter className="flex-wrap">
          {step === "os" ? (
            <Button
              disabled={Boolean(busy) || pending || https.transport !== "https"}
              onClick={() => void begin()}
            >
              {tr(pending ? "https_qr_preparing" : "https_step_continue")}
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={Boolean(busy) || pending}
                onClick={() => void back()}
              >
                <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                {tr("https_step_back")}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{tr("close")}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
