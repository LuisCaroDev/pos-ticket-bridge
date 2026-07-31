import { memo } from "react";
import { Clipboard, Power, Wifi } from "lucide-react";
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
  const { copy, status } = useBridge();
  const { tr } = useI18n();
  if (!status) return null;

  const host = status.suggestedHosts?.[0] || "";
  const token = status.token || "";

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="size-4" />
            {tr("bridge_host")}
          </CardTitle>
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
          <CardDescription>{tr("access_token_description")}</CardDescription>
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
    </section>
  );
});
