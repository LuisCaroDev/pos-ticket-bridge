import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.InputGroup>) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "flex h-9 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxTrigger({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Trigger>) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex h-full w-8 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </ComboboxPrimitive.Trigger>
  );
}

const ComboboxPortal = ComboboxPrimitive.Portal;

function ComboboxPositioner({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Positioner>) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      sideOffset={sideOffset}
      className={cn("z-50 outline-none", className)}
      {...props}
    />
  );
}

function ComboboxPopup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup>) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        "w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-3 py-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.List>) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(22.5rem,var(--available-height))] overflow-y-auto p-1 outline-none",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <ComboboxPrimitive.ItemIndicator className="flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </ComboboxPrimitive.Item>
  );
}

export {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxTrigger,
};
