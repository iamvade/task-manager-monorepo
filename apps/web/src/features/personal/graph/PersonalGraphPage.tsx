import { buildPersonalGraph, type GraphNode, type PaletteKey } from '@kite/shared';
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useWsPath } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import { ExpandIcon, MinusIcon, PlusIcon } from '../../../components/icons';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconButton } from '../../../components/ui/IconButton';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { Skeleton } from '../../../components/ui/Skeleton';
import { cn } from '../../../lib/cn';
import { paletteClass } from '../../../lib/palette';
import { PersonalHeader } from '../PersonalHeader';
import { usePersonalLinks } from '../usePersonal';
import { layoutGraph, type PlacedNode } from './layout';

const LABEL_MAX = 24;
const clip = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s);

interface View {
  x: number;
  y: number;
  k: number;
}

/**
 * Personal graph (Obsidian-style): notes and to-dos as nodes colored by topic, team tasks as
 * diamonds, notes not created yet dashed; lines are `[[links]]`. Drag to pan, wheel or buttons to
 * zoom; a node opens its item. The Connections list below says the same in text.
 */
export function PersonalGraphPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const ws = useWsPath();
  const topic = params.get('topic');
  const { index, items, tasks, itemHref, taskHref, navigate, createAndOpen } = usePersonalLinks();
  const links = index.data?.links;
  const topics = index.data?.topics;

  const graph = useMemo(() => {
    const include =
      topic === null
        ? () => true
        : (i: { topicId: string | null }) =>
            topic === 'none' ? i.topicId === null : i.topicId === topic;
    return buildPersonalGraph(items, tasks, links ?? [], include);
  }, [items, tasks, links, topic]);
  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const colorOf = useMemo(() => new Map((topics ?? []).map((x) => [x.id, x.color])), [topics]);

  const labelOf = (n: GraphNode): string => {
    if (n.kind === 'item') return itemById.get(n.itemId)?.title ?? '';
    if (n.kind === 'task') {
      const task = taskById.get(n.taskId);
      return task ? `${task.key} ${task.title}` : '';
    }
    if (n.kind === 'unavailable') return `${n.key} · ${t('personal.link.unavailable')}`;
    return n.title;
  };

  const header = <PersonalHeader tab="graph" topic={topic} />;
  if (index.isError) {
    return (
      <>
        {header}
        <ErrorState error={index.error} />
      </>
    );
  }
  if (index.isPending) {
    return (
      <>
        {header}
        <div className="p-6" aria-busy="true">
          <Skeleton height={320} />
        </div>
      </>
    );
  }

  const open = (n: GraphNode) => {
    if (n.kind === 'item') void navigate(itemHref(n.itemId));
    else if (n.kind === 'task') {
      const task = taskById.get(n.taskId);
      if (task) void navigate(taskHref(task));
    } else if (n.kind === 'uncreated') void createAndOpen(n.title);
  };

  const topicHref = (x: string | null) =>
    ws(`/personal/graph${x ? `?topic=${encodeURIComponent(x)}` : ''}`);
  const chips: { id: string | null; label: string; color?: PaletteKey }[] = [
    { id: null, label: t('personal.topics.all') },
    { id: 'none', label: t('personal.topics.none') },
    ...(topics ?? []).map((x) => ({ id: x.id, label: x.name, color: x.color })),
  ];

  return (
    <>
      {header}
      <div className="flex flex-col gap-4 px-6 py-4">
        <nav aria-label={t('personal.topics.label')} className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <Link
              key={c.id ?? 'all'}
              to={topicHref(c.id)}
              aria-current={topic === c.id ? 'page' : undefined}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium no-underline',
                topic === c.id
                  ? 'border-transparent bg-accent-soft text-accent-ink'
                  : 'border-default bg-transparent text-2 hover:bg-hover',
              )}
            >
              {c.color && <ProjectDot color={c.color} size={8} />}
              {c.label}
            </Link>
          ))}
        </nav>

        {layout.nodes.length === 0 ? (
          <EmptyState title={t('personal.graph.emptyTitle')} body={t('personal.graph.emptyBody')} />
        ) : (
          <GraphCanvas
            layout={layout}
            labelOf={labelOf}
            colorOf={(n) => {
              if (n.kind !== 'item') return null;
              const topicId = itemById.get(n.itemId)?.topicId;
              return topicId ? (colorOf.get(topicId) ?? null) : null;
            }}
            isTodo={(n) => n.kind === 'item' && itemById.get(n.itemId)?.kind === 'todo'}
            onOpen={open}
          />
        )}

        {graph.edges.length > 0 && (
          <section aria-labelledby="personal-connections-h" className="flex flex-col gap-2">
            <h2 id="personal-connections-h" className="m-0 text-[13px] font-semibold text-2">
              {t('personal.graph.connections')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 pl-0 text-[13px]">
              {layout.nodes
                .filter((n) => n.node.kind === 'item')
                .map((n) => {
                  const targets = layout.edges
                    .filter((e) => e.source === n || e.target === n)
                    .map((e) => (e.source === n ? e.target : e.source));
                  if (targets.length === 0 || n.node.kind !== 'item') return null;
                  return (
                    <li key={n.node.id} className="flex flex-wrap items-baseline gap-x-1.5">
                      <Link to={itemHref(n.node.itemId)} className="font-medium text-default">
                        {labelOf(n.node)}
                      </Link>
                      <span className="text-muted">—</span>
                      <span className="text-2">
                        {targets.map((x) => labelOf(x.node)).join(', ')}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

interface GraphCanvasProps {
  layout: ReturnType<typeof layoutGraph>;
  labelOf: (n: GraphNode) => string;
  colorOf: (n: GraphNode) => PaletteKey | null;
  isTodo: (n: GraphNode) => boolean;
  onOpen: (n: GraphNode) => void;
}

const HEIGHT = 480;
const PAD = 60;

function GraphCanvas({ layout, labelOf, colorOf, isTodo, onOpen }: GraphCanvasProps) {
  const { t } = useTranslation();
  const { bounds } = layout;
  const width = Math.max(bounds.maxX - bounds.minX + PAD * 2, 720);
  const height = Math.max(bounds.maxY - bounds.minY + PAD * 2, 460);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const zoom = (factor: number) => {
    setView((v) => ({ ...v, k: Math.min(4, Math.max(0.25, v.k * factor)) }));
  };
  /** Screen pixels → graph units (the SVG scales the viewBox to its box). */
  const unitsPerPixel = () => {
    const box = svgRef.current?.getBoundingClientRect();
    return box && box.width > 0 ? Math.max(width / box.width, height / box.height) : 1;
  };

  const onWheel = (e: WheelEvent) => {
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('[data-node]')) return;
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const u = unitsPerPixel();
    setView((v) => ({
      ...v,
      x: d.x + ((e.clientX - d.px) * u) / v.k,
      y: d.y + ((e.clientY - d.py) * u) / v.k,
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const radius = (n: PlacedNode) => 7 + Math.min(n.degree, 6) * 1.5;

  return (
    <div className="relative overflow-hidden rounded-[12px] border border-default bg-surface">
      <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-[8px] border border-default bg-surface p-0.5">
        <IconButton
          label={t('personal.graph.zoomIn')}
          size={28}
          icon={<PlusIcon size={14} />}
          onClick={() => {
            zoom(1.25);
          }}
        />
        <IconButton
          label={t('personal.graph.zoomOut')}
          size={28}
          icon={<MinusIcon size={14} />}
          onClick={() => {
            zoom(0.8);
          }}
        />
        <IconButton
          label={t('personal.graph.fit')}
          size={28}
          icon={<ExpandIcon size={14} />}
          onClick={() => {
            setView({ x: 0, y: 0, k: 1 });
          }}
        />
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label={t('personal.graph.label')}
        viewBox={`${cx - width / 2} ${cy - height / 2} ${width} ${height}`}
        className="block w-full cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ height: HEIGHT }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g
          transform={`translate(${cx} ${cy}) scale(${view.k}) translate(${-cx + view.x} ${-cy + view.y})`}
        >
          <g aria-hidden="true">
            {layout.edges.map((e) => (
              <line
                key={`${e.source.node.id}|${e.target.node.id}`}
                x1={e.source.x}
                y1={e.source.y}
                x2={e.target.x}
                y2={e.target.y}
                stroke="var(--border-strong)"
                strokeWidth={1.25}
                strokeDasharray={
                  e.target.node.kind === 'uncreated' || e.source.node.kind === 'uncreated'
                    ? '4 3'
                    : undefined
                }
              />
            ))}
          </g>
          {layout.nodes.map((n) => {
            const label = labelOf(n.node);
            const r = radius(n);
            const color = colorOf(n.node);
            const focusable = n.node.kind !== 'unavailable';
            let shape;
            if (n.node.kind === 'task' || n.node.kind === 'unavailable') {
              shape = (
                <rect
                  x={-r * 0.8}
                  y={-r * 0.8}
                  width={r * 1.6}
                  height={r * 1.6}
                  transform="rotate(45)"
                  fill={n.node.kind === 'task' ? 'var(--accent)' : 'var(--surface)'}
                  stroke={n.node.kind === 'task' ? 'none' : 'var(--text-muted)'}
                />
              );
            } else if (n.node.kind === 'uncreated') {
              shape = (
                <circle
                  r={r}
                  fill="var(--surface)"
                  stroke="var(--text-muted)"
                  strokeDasharray="3 2"
                />
              );
            } else if (isTodo(n.node)) {
              shape = (
                <rect
                  x={-r}
                  y={-r}
                  width={r * 2}
                  height={r * 2}
                  rx={3}
                  className={color ? paletteClass('project', color) : undefined}
                  fill={color ? 'var(--p-dot)' : 'var(--text-muted)'}
                />
              );
            } else {
              shape = (
                <circle
                  r={r}
                  className={color ? paletteClass('project', color) : undefined}
                  fill={color ? 'var(--p-dot)' : 'var(--text-muted)'}
                />
              );
            }
            return (
              <g
                key={n.node.id}
                data-node=""
                transform={`translate(${n.x} ${n.y})`}
                role={focusable ? 'link' : 'img'}
                tabIndex={focusable ? 0 : undefined}
                aria-label={label}
                className={cn(
                  'outline-none [&:focus-visible>.ring]:stroke-[var(--accent-ink)]',
                  focusable && 'cursor-pointer',
                )}
                onClick={() => {
                  onOpen(n.node);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(n.node);
                  }
                }}
              >
                <circle
                  className="ring"
                  r={r + 4}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={2}
                />
                {shape}
                <text
                  y={r + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--text-2)"
                  style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}
                >
                  {clip(label)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
