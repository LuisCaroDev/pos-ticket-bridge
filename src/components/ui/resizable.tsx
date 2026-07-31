import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full", className)}
      {...props}
    />
  );
}

function ResizablePanel({ className, ...props }: PanelProps) {
  return <Panel data-slot="resizable-panel" className={className} {...props} />;
}

function ResizableHandle({
  className,
  withHandle = false,
  ...props
}: SeparatorProps & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative flex w-px shrink-0 items-center justify-center bg-border outline-none before:absolute before:inset-y-0 before:-left-2 before:w-4 hover:bg-primary/50 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex size-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm group-hover:text-foreground">
          <GripVertical className="size-4" />
        </div>
      )}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
