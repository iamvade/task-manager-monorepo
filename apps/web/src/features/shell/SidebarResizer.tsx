import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon } from '../../components/icons';
import { cn } from '../../lib/cn';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  useUiStore,
} from '../../stores/ui';

/** Rail width (`SidebarRail`, w-14). */
const RAIL_WIDTH = 56;
/** Dragged narrower than this, the sidebar snaps to the rail; wider, the rail opens. */
const SNAP_WIDTH = 140;
/** Pointer travel before a press counts as a drag instead of a click. */
const DRAG_SLOP = 3;
const KEY_STEP = 16;
/** Set on the shell root while dragging, so the sidebar follows without re-rendering. */
export const LIVE_WIDTH_VAR = '--sidebar-live-w';

interface Drag {
  pointerId: number;
  startX: number;
  /** Left edge of the shell (the sidebar starts there). */
  originX: number;
  dragging: boolean;
  width: number;
}

/**
 * The sidebar's (or rail's) right border: drag to resize the sidebar (220–420px, remembered),
 * click to collapse it to the rail or expand it again. Shows a small chevron while hovered.
 * Not in the designs.
 */
export function SidebarResizer() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const width = useUiStore((s) => s.sidebarWidth);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const setWidth = useUiStore((s) => s.setSidebarWidth);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const shellOf = (el: HTMLElement) => el.parentElement?.parentElement ?? null;

  const endDrag = (el: HTMLElement) => {
    shellOf(el)?.style.removeProperty(LIVE_WIDTH_VAR);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    drag.current = null;
    setDragging(false);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const originX = shellOf(e.currentTarget)?.getBoundingClientRect().left ?? 0;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      originX,
      dragging: false,
      width: collapsed ? RAIL_WIDTH : width,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    if (!d.dragging) {
      if (Math.abs(e.clientX - d.startX) < DRAG_SLOP) return;
      d.dragging = true;
      setDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    const raw = e.clientX - d.originX;
    const { sidebarCollapsed } = useUiStore.getState();
    if (raw < SNAP_WIDTH) {
      if (!sidebarCollapsed) setCollapsed(true);
      return;
    }
    if (sidebarCollapsed) setCollapsed(false);
    d.width = clampSidebarWidth(raw);
    shellOf(e.currentTarget)?.style.setProperty(LIVE_WIDTH_VAR, `${d.width}px`);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    if (!d.dragging) {
      setCollapsed(!useUiStore.getState().sidebarCollapsed);
    } else if (!useUiStore.getState().sidebarCollapsed) {
      setWidth(d.width);
    }
    endDrag(e.currentTarget);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        setCollapsed(!collapsed);
        break;
      case 'ArrowLeft':
        if (collapsed) return;
        if (width <= SIDEBAR_MIN_WIDTH) setCollapsed(true);
        else setWidth(width - KEY_STEP);
        break;
      case 'ArrowRight':
        if (collapsed) setCollapsed(false);
        else setWidth(width + KEY_STEP);
        break;
      case 'Home':
        if (collapsed) setCollapsed(false);
        setWidth(SIDEBAR_MIN_WIDTH);
        break;
      case 'End':
        if (collapsed) setCollapsed(false);
        setWidth(SIDEBAR_MAX_WIDTH);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="relative z-20 w-0 flex-none">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('shell.resizeSidebar')}
        aria-valuemin={RAIL_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={collapsed ? RAIL_WIDTH : width}
        aria-valuetext={collapsed ? t('shell.sidebarCollapsed') : `${width}px`}
        tabIndex={0}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          if (drag.current?.pointerId === e.pointerId) endDrag(e.currentTarget);
        }}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -left-[5px] flex w-[9px] cursor-col-resize touch-none justify-center outline-none"
      >
        {/* The border line, in accent while hovered, focused or dragged. */}
        <span
          aria-hidden="true"
          className="h-full w-0.5 bg-transparent transition-colors delay-100 group-hover:bg-accent group-focus-visible:bg-accent group-data-[dragging]:bg-accent"
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 left-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-default bg-surface text-2 opacity-0 shadow-popover transition-opacity delay-100',
            'group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent-ink group-data-[dragging]:opacity-0',
          )}
        >
          <ChevronRightIcon size={12} className={cn(!collapsed && 'rotate-180')} />
        </span>
      </div>
    </div>
  );
}
