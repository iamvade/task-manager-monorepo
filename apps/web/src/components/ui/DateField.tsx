interface DateFieldProps {
  id: string;
  label: string;
  /** `YYYY-MM-DD`, or '' when empty. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
}

/** Labelled native date input (Reports custom period, new sprint): 32px, radius 8. */
export function DateField({ id, label, value, onChange, min }: DateFieldProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="box-border h-8 w-full min-w-0 rounded-[8px] border border-control bg-control px-2 text-[13px]"
      />
    </div>
  );
}
