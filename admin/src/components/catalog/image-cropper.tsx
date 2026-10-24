"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Crosshair, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import {
  CENTRED,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
  cropRect,
  cropStyle,
  panCrop,
  sliderToZoom,
  zoomCrop,
  zoomToSlider,
  type CropState,
  type CropTarget,
  type Size,
} from "@/lib/image-crop";

/** A transparency checkerboard behind a picture that keeps its transparency. */
const CHECKER = {
  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
  backgroundSize: "16px 16px",
};

/**
 * The shared crop frame (VIS-021): drag to reposition in both directions,
 * "Image size" to zoom out or in — the slider starts in the middle, the
 * centred crop — and the frame shows exactly the part of the picture that
 * will be kept, at the output's aspect ratio. Arrow keys move it too. A
 * zoomed-out picture shows its margins in the colour they will be saved in
 * (white, or the transparency checkerboard). Geometry is physical
 * (left/right), so the frame and the slider are laid out LTR in both
 * languages; − always zooms out and + in.
 */
export function ImageCropper({
  src,
  size,
  target,
  state,
  onChange,
  transparent,
  safeArea = false,
  testId,
}: {
  src: string;
  size: Size;
  target: CropTarget;
  state: CropState;
  onChange: (state: CropState) => void;
  /** Margins stay transparent (checkerboard) rather than white. */
  transparent: boolean;
  /** Outline the middle of the frame, where essential artwork belongs. */
  safeArea?: boolean;
  testId?: string;
}) {
  const t = useTranslations("imageEditor");
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const rect = cropRect(size, target.aspect, state);
  const slider = zoomToSlider(size, target.aspect, state.zoom);
  const id = (suffix: string) => (testId ? `${testId}-${suffix}` : undefined);

  const width = () => frame.current?.getBoundingClientRect().width ?? 0;
  const setSlider = (value: number) => onChange(zoomCrop(size, target.aspect, state, sliderToZoom(size, target.aspect, value)));

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
    if (move) {
      event.preventDefault();
      onChange(panCrop(size, target.aspect, state, move[0], move[1], width()));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setSlider(slider + SLIDER_STEP / 2);
    } else if (event.key === "-") {
      event.preventDefault();
      setSlider(slider - SLIDER_STEP / 2);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div
        ref={frame}
        dir="ltr"
        tabIndex={0}
        role="group"
        aria-label={t("frame")}
        aria-describedby={id("help")}
        className="relative mx-auto w-full cursor-grab touch-none select-none overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        // A square needs no more than a comfortable 20rem; a wide banner takes the row.
        style={{
          aspectRatio: String(target.aspect),
          maxWidth: target.aspect <= 1 ? "20rem" : undefined,
          ...(transparent ? CHECKER : { backgroundColor: "#ffffff" }),
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        data-testid={id("frame")}
        data-crop={`${Math.round(rect.sx)},${Math.round(rect.sy)},${Math.round(rect.sw)},${Math.round(rect.sh)}`}
        data-zoom={state.zoom.toFixed(3)}
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
      <p id={id("help")} className="text-xs text-text-muted">
        {safeArea ? t("dragHelpSafe") : t("dragHelp")}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={id("size") ?? "image-size"} className="text-sm font-semibold">
          {t("size")}
        </label>
        <div className="flex items-center gap-2" dir="ltr">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSlider(slider - SLIDER_STEP)}
            disabled={slider <= SLIDER_MIN + 0.01}
            aria-label={t("zoomOut")}
            title={t("zoomOut")}
            data-testid={id("zoom-out")}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <input
            id={id("size") ?? "image-size"}
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={0.5}
            value={slider}
            aria-valuetext={t("sizeValue", { percent: Math.round(state.zoom * 100) })}
            onChange={(event) => setSlider(Number(event.target.value))}
            className="h-2 flex-1 cursor-pointer accent-primary"
            data-testid={id("zoom")}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSlider(slider + SLIDER_STEP)}
            disabled={slider >= SLIDER_MAX - 0.01}
            aria-label={t("zoomIn")}
            title={t("zoomIn")}
            data-testid={id("zoom-in")}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-text-muted" data-testid={id("size-value")}>
            {t("sizeValue", { percent: Math.round(state.zoom * 100) })}
          </span>
          <Button size="sm" variant="ghost" onClick={() => onChange(CENTRED)} data-testid={id("centre")}>
            <Crosshair className="size-4" aria-hidden />
            {t("centre")}
          </Button>
        </div>
      </div>
    </div>
  );
}
