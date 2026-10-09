import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { BulletListIcon, ChevronDownIcon, CodeIcon, LinkIcon, NumberedListIcon } from '../icons';
import { Menu } from '../ui/Menu';
import { Popover, type TriggerProps } from '../ui/Popover';
import { insertMentionTrigger } from './commands';

function ToolButton({
  label,
  active,
  onClick,
  children,
  className,
  triggerProps,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  triggerProps?: TriggerProps;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      {...triggerProps}
      onMouseDown={keepSelection(triggerProps)}
      className={cn(
        'flex size-7 items-center justify-center rounded-[6px] border-0 text-[13px] text-2 hover:bg-hover',
        active ? 'bg-surface-2 text-default' : 'bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Keeps the editor selection when a toolbar control is pressed, then runs the trigger's handler. */
const keepSelection = (triggerProps?: TriggerProps) => (e: MouseEvent<HTMLButtonElement>) => {
  e.preventDefault();
  (triggerProps?.onMouseDown as ((ev: MouseEvent) => void) | undefined)?.(e);
};

const Divider = () => (
  <span aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--border-control)]" />
);

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');

  function apply(close: () => void) {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url) chain.setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    else chain.unsetLink().run();
    close();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHref((editor.getAttributes('link').href as string | undefined) ?? '');
        setOpen(next);
      }}
      label={t('drawer.toolbar.link')}
      width={280}
      elevation="sm"
      trigger={(props) => (
        <ToolButton label={t('drawer.toolbar.link')} active={active} triggerProps={props}>
          <LinkIcon size={14} />
        </ToolButton>
      )}
    >
      {(close) => (
        <form
          className="flex items-center gap-1 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply(close);
          }}
        >
          <input
            type="url"
            inputMode="url"
            value={href}
            placeholder={t('drawer.linkPlaceholder')}
            aria-label={t('drawer.toolbar.link')}
            onChange={(e) => {
              setHref(e.target.value);
            }}
            className="h-8 min-w-0 flex-1 rounded-[6px] border border-control bg-control px-2 text-[13px] outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            className="h-8 rounded-[6px] border-0 bg-accent px-2.5 text-[13px] font-medium text-white"
          >
            {t('drawer.linkApply')}
          </button>
        </form>
      )}
    </Popover>
  );
}

/**
 * Description toolbar (TaskDetail.dc.html): Text ▾ │ B I S code │ bullets, numbers, link, @.
 * Buttons show their state with `aria-pressed`.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      link: e.isActive('link'),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label={t('drawer.toolbar.label')}
      className="flex flex-wrap items-center gap-0.5 border-b border-subtle p-1"
    >
      <Menu
        label={t('drawer.toolbar.text')}
        width={180}
        items={[
          {
            id: 'p',
            label: t('drawer.toolbar.text'),
            checked: !state.h3 && !state.h4,
            onSelect: () => chain().setParagraph().run(),
          },
          {
            id: 'h3',
            label: t('drawer.toolbar.heading'),
            checked: state.h3,
            onSelect: () => chain().toggleHeading({ level: 3 }).run(),
          },
          {
            id: 'h4',
            label: t('drawer.toolbar.subheading'),
            checked: state.h4,
            onSelect: () => chain().toggleHeading({ level: 4 }).run(),
          },
        ]}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            onMouseDown={keepSelection(props)}
            className="flex h-7 items-center gap-1 rounded-[6px] border-0 bg-transparent px-2 text-[12px] text-2 hover:bg-hover"
          >
            {state.h3
              ? t('drawer.toolbar.heading')
              : state.h4
                ? t('drawer.toolbar.subheading')
                : t('drawer.toolbar.text')}
            <ChevronDownIcon size={10} strokeWidth={3} />
          </button>
        )}
      />
      <Divider />
      <ToolButton
        label={t('drawer.toolbar.bold')}
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
        className="font-bold"
      >
        B
      </ToolButton>
      <ToolButton
        label={t('drawer.toolbar.italic')}
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
        className="font-[Georgia,serif] italic"
      >
        I
      </ToolButton>
      <ToolButton
        label={t('drawer.toolbar.strike')}
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
        className="line-through"
      >
        S
      </ToolButton>
      <ToolButton
        label={t('drawer.toolbar.code')}
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <CodeIcon size={14} />
      </ToolButton>
      <Divider />
      <ToolButton
        label={t('drawer.toolbar.bulletList')}
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <BulletListIcon size={14} />
      </ToolButton>
      <ToolButton
        label={t('drawer.toolbar.orderedList')}
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <NumberedListIcon size={14} />
      </ToolButton>
      <LinkButton editor={editor} active={state.link} />
      <ToolButton
        label={t('drawer.toolbar.mention')}
        onClick={() => {
          insertMentionTrigger(editor);
        }}
        className="text-[14px]"
      >
        @
      </ToolButton>
    </div>
  );
}
