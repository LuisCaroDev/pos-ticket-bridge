import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { memo, useState } from "react";
import type { LocalHttpsStatus } from "@/core/local-https-types";
import { HttpsDeviceDialog } from "./HttpsDeviceDialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { translateMessage } from "@/i18n";
import {
  Clipboard,
  Power,
  Wifi,
  MoreVertical,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";

export const BridgeAccessCards = memo(function BridgeAccessCards() {
  const { copy, status, busy, perform } = useBridge();
  const { tr, language } = useI18n();
  const [setupOpen, setSetupOpen] = useState(false);
  const https: LocalHttpsStatus | undefined = status?.localHttps;
  if (!status) return null;

  const host = status.suggestedHosts?.[0] || "";
  const token = status.token || "";
  const supported = ["win32", "darwin"].includes(window.bridge.platform);

  return (
    <>
      <section
        aria-labelledby="webpos-connection-title"
        className="flex flex-col gap-4"
      >
        <h2 id="webpos-connection-title" className="text-base font-semibold">
          {tr("webpos_connection")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="size-4" />
                  {tr("bridge_host")}
                </CardTitle>
              </div>
              <CardDescription>{tr("bridge_host_description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <code className="truncate rounded bg-muted px-2 py-1 text-sm">
                {host}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(host)}>
                <Clipboard data-icon="inline-start" />
                {tr("copy")}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Power className="size-4" />
                {tr("access_token")}
              </CardTitle>
              <CardDescription>
                {tr("access_token_description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <code className="truncate rounded bg-muted px-2 py-1 text-sm">
                {token}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(token)}>
                <Clipboard data-icon="inline-start" />
                {tr("copy")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
      {https?.state === "active" && (
        <Card aria-labelledby="local-https-title">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle
                id="local-https-title"
                className="flex items-center gap-2 text-base"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                {tr("https_title")}
              </CardTitle>
              {supported && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tr("https_actions")}
                        disabled={Boolean(busy)}
                      />
                    }
                  >
                    <MoreVertical aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void perform("https-reset", () =>
                            window.bridge.httpsReset(),
                          )
                        }
                      >
                        <RotateCcw aria-hidden="true" />
                        {tr("https_reset")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <CardDescription>{tr("https_access_description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {tr("https_state", { state: tr(`https_${https.state}`) })}
              </Badge>
              <Badge variant="outline">
                {tr("https_transport", {
                  transport:
                    https.transport === "stopped"
                      ? tr("https_stopped")
                      : https.transport.toUpperCase(),
                })}
              </Badge>
            </div>
            {supported &&
              https.localTrust &&
              !["trusted", "unsupported"].includes(https.localTrust) && (
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void perform("https-trust", () =>
                      window.bridge.httpsTrust(),
                    )
                  }
                >
                  <ShieldCheck aria-hidden="true" data-icon="inline-start" />
                  {tr("https_trust_retry")}
                </Button>
              )}
            {https.expiresAt && (
              <p className="text-sm">
                {tr("https_expiry", {
                  date: new Date(https.expiresAt).toLocaleDateString(language),
                })}
              </p>
            )}
            {https.caExpiresAt && (
              <p className="text-sm">
                {tr("https_ca_expiry", {
                  date: new Date(https.caExpiresAt).toLocaleDateString(
                    language,
                  ),
                })}
              </p>
            )}
            {https.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {translateMessage(language, https.error)}
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-muted-foreground">
              {tr("https_ip_notice")}
            </p>
            {["win32", "darwin"].includes(window.bridge.platform) && (
              <Button
                variant="outline"
                disabled={https.transport !== "https"}
                onClick={() => setSetupOpen(true)}
              >
                {tr("https_setup_other")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {https?.state === "active" && (
        <HttpsDeviceDialog open={setupOpen} onOpenChange={setSetupOpen} />
      )}
    </>
  );
});
