import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '../../components/icons';

interface AddTaskRowProps {
  /** Input shown (header "+" or this row was clicked). */
  active: boolean;
  onStart: () => void;
  onCancel: () => void;
  /** Called per Enter; the input clears and keeps focus for the next title. */
  onSubmit: (title: string) => void;
}

/**
 * "+ Add task" at the bottom of a group (Main.dc.html ghost button, 36px, indent 20). Clicking
 * turns it into an inline title input (derived, same height and type).
 */
export function AddTaskRow({ active, onStart, onCancel, onSubmit }: AddTaskRowProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');

  if (!active) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="flex h-9 items-center gap-2 border-0 bg-transparent pl-5 text-left text-[13px] text-muted hover:bg-hover"
      >
        <PlusIcon size={14} />
        {t('table.addTask')}
      </button>
    );
  }

  return (
    <div className="flex h-9 items-center gap-2 border-b border-subtle pl-5 text-[13px]">
      <PlusIcon size={14} className="flex-none text-muted" />
      <input
        type="text"
        autoFocus
        value={title}
        aria-label={t('table.newTaskTitle')}
        placeholder={t('table.addTaskPlaceholder')}
        maxLength={500}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            const value = title.trim();
            if (!value) return;
            onSubmit(value);
            setTitle('');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setTitle('');
            onCancel();
          }
        }}
        onBlur={() => {
          if (!title.trim()) onCancel();
        }}
        className="h-8 min-w-0 flex-1 rounded-[6px] border-0 bg-transparent px-1 text-[13px] text-default placeholder:text-faint"
      />
    </div>
  );
}
