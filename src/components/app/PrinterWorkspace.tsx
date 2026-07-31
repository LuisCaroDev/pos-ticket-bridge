import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

type PrinterWorkspaceProps = {
  children: ReactNode;
  editor?: ReactNode;
};

const splitContentWidth = "max-w-2xl";
const editorSizeStorageKey = "pos-ticket-bridge.printer-workspace.editor-size";
const defaultEditorSize = 50;
const panelAnimationDuration = 250;
const closedLayout = {
  "printer-options": 100,
  "printer-editing": 0,
};

function getRememberedEditorSize() {
  const storedSize = Number(
    window.sessionStorage.getItem(editorSizeStorageKey),
  );
  return Number.isFinite(storedSize) && storedSize > 0 && storedSize < 100
    ? storedSize
    : defaultEditorSize;
}

function getOpenLayout(editorSize: number): Layout {
  return {
    "printer-options": 100 - editorSize,
    "printer-editing": editorSize,
  };
}

export function PrinterWorkspace({ children, editor }: PrinterWorkspaceProps) {
  const groupRef = useRef<GroupImperativeHandle>(null);
  const groupElementRef = useRef<HTMLDivElement>(null);
  const activeAnimations = useRef<Animation[]>([]);
  const [renderedEditor, setRenderedEditor] = useState<ReactNode>();
  const [animation, setAnimation] = useState<"opening" | "closing">();
  const isEditing = Boolean(editor);
  const panelEditor = editor ?? renderedEditor;
  const hasVisibleEditor = Boolean(panelEditor);

  const animateLayout = (nextLayout: Layout, onFinish: () => void) => {
    const panels = Array.from(
      groupElementRef.current?.querySelectorAll<HTMLElement>("[data-panel]") ??
        [],
    );
    const initialSizes = new Map(
      panels.map((panel) => [
        panel.id,
        window.getComputedStyle(panel).flexGrow,
      ]),
    );

    activeAnimations.current.forEach((animation) => animation.cancel());
    groupRef.current?.setLayout(nextLayout);

    if (!panels.length || typeof panels[0].animate !== "function") {
      onFinish();
      return;
    }

    const animations = panels.map((panel) =>
      panel.animate(
        [
          { flexGrow: initialSizes.get(panel.id) },
          { flexGrow: String(nextLayout[panel.id]) },
        ],
        {
          duration: panelAnimationDuration,
          easing: "ease-out",
          fill: "both",
        },
      ),
    );
    activeAnimations.current = animations;

    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (activeAnimations.current !== animations) return;
      animations.forEach((animation) => animation.cancel());
      activeAnimations.current = [];
      onFinish();
    });
  };

  useEffect(() => {
    if (isEditing) {
      setRenderedEditor(editor);
      setAnimation("opening");
      let secondFrame = 0;
      let cancelled = false;
      const open = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          animateLayout(getOpenLayout(getRememberedEditorSize()), () => {
            if (!cancelled) setAnimation(undefined);
          });
        });
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(open);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    if (!renderedEditor) return;

    setAnimation("closing");
    let secondFrame = 0;
    let cancelled = false;
    const close = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        animateLayout(closedLayout, () => {
          if (cancelled) return;
          setRenderedEditor(undefined);
          setAnimation(undefined);
        });
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(close);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isEditing]);

  const rememberLayout = (layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return;
    const editorSize = layout["printer-editing"];
    if (editorSize > 0 && editorSize < 100)
      window.sessionStorage.setItem(editorSizeStorageKey, String(editorSize));
  };

  return (
    <ResizablePanelGroup
      id="printer-workspace"
      groupRef={groupRef}
      elementRef={groupElementRef}
      defaultLayout={closedLayout}
      orientation="horizontal"
      className={cn("h-screen", animation && "printer-workspace-animating")}
      onLayoutChanged={rememberLayout}
    >
      <ResizablePanel id="printer-options" minSize="20rem">
        <div className="h-full overflow-y-auto overscroll-contain px-6">
          <div
            className={`printer-workspace-primary-content flex w-full ${splitContentWidth} flex-col gap-5 py-6`}
          >
            {children}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className={cn(!hasVisibleEditor && "pointer-events-none opacity-0")}
      />
      <ResizablePanel id="printer-editing" minSize="0%">
        <div className="h-full w-full overflow-hidden">{panelEditor}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
