import { memo } from "react";
import { Radar, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/contexts/BridgeContext";
import { useI18n } from "@/contexts/I18nContext";

type AppHeaderProps = {
  onOpenSettings: () => void;
};

export const AppHeader = memo(function AppHeader({
  onOpenSettings,
}: AppHeaderProps) {
  const { appVersion, refresh } = useBridge();
  const { tr } = useI18n();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">POS Ticket Bridge</h1>
          <Badge variant="secondary">{tr("active")}</Badge>
          {appVersion && (
            <span className="text-xs text-muted-foreground">v{appVersion}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("app_description")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void refresh()}>
          <Radar data-icon="inline-start" />
          {tr("refresh")}
        </Button>
        <Button
          size="icon"
          variant="outline"
          aria-label={tr("advanced_settings")}
          title={tr("advanced_settings")}
          onClick={onOpenSettings}
        >
          <Settings2 />
        </Button>
      </div>
    </header>
  );
});
