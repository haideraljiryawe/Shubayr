"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui";
import {
  CENTRED,
  MAX_ZOOM,
  MIN_ZOOM,
  cropRect,
  cropStyle,
  panCrop,
  zoomCrop,
  type CropState,
  type CropTarget,
  type Size,
} from "@/lib/image-crop";

/** A transparency checkerboard behind the picture. */
const CHECKER = {
  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
  backgroundSize: "16px 16px",
};

/**
 * Drag to reposition, slide to zoom: the frame shows exactly the part of the
 * picture that will be kept, at the output's aspect ratio. Arrow keys move it
 * too. Geometry is physical (left/right), so the frame is laid out LTR in
 * both languages.
 */
export function ImageCropper({
  src,
  size,
  target,
  state,
  onChange,
  safeArea = false,
  testId,
}: {
  src: string;
  size: Size;
  target: CropTarget;
  state: CropState;
  onChange: (state: CropState) => void;
  /** Outline the middle of the frame, where essential artwork belongs. */
  safeArea?: boolean;
  testId?: string;
}) {
  const t = useTranslations("imageEditor");
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const rect = cropRect(size, target.aspect, state);

  const width = () => frame.current?.getBoundingClientRect().width ?? 0;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    onChange(panCrop(size, target.aspect, state, dx, dy, width()));
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange(panCrop(size, target.aspect, state, move[0], move[1], width()));
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div
        ref={frame}
        dir="ltr"
        tabIndex={0}
        role="group"
        aria-label={t("frame")}
        aria-describedby={testId ? `${testId}-help` : undefined}
        className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        style={{ aspectRatio: String(target.aspect), ...CHECKER }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        data-testid={testId ? `${testId}-frame` : undefined}
        data-crop={`${Math.round(rect.sx)},${Math.round(rect.sy)},${Math.round(rect.sw)},${Math.round(rect.sh)}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, positioned to show the crop */}
        <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={cropStyle(size, rect)} />
        {safeArea ? (
          <span
            className="pointer-events-none absolute inset-y-[12%] inset-x-[10%] rounded border-2 border-dashed border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
            aria-hidden
          />
        ) : null}
      </div>
      <p id={testId ? `${testId}-help` : undefined} className="text-xs text-text-muted">
        {safeArea ? t("dragHelpSafe") : t("dragHelp")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-sm font-semibold">
          {t("zoom")}
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={state.zoom}
            onChange={(event) => onChange(zoomCrop(size, target.aspect, state, Number(event.target.value)))}
            className="flex-1"
            data-testid={testId ? `${testId}-zoom` : undefined}
          />
        </label>
        <Button size="sm" variant="ghost" onClick={() => onChange(CENTRED)} data-testid={testId ? `${testId}-centre` : undefined}>
          <Crosshair className="size-4" aria-hidden />
          {t("centre")}
        </Button>
      </div>
    </div>
  );
}
