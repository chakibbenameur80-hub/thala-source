"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";

/**
 * Form primitives.
 *
 * Each control is fully labelled (a real `<label for>`), and the error message
 * is wired through `aria-describedby` + `aria-invalid` so it is announced by
 * screen readers — the checkout is the one flow where a silent validation
 * failure costs a sale.
 */

const CONTROL =
  "w-full rounded-xl border bg-cream-50 px-4 py-3 text-[0.95rem] text-ink-900 " +
  "placeholder:text-ink-500/60 transition outline-none " +
  "focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30";

const CONTROL_ERROR = "border-danger focus:border-danger focus:ring-danger/30";
const CONTROL_OK = "border-cream-400";

function shell(hasError: boolean) {
  return cx(CONTROL, hasError ? CONTROL_ERROR : CONTROL_OK);
}

type BaseProps = {
  label: string;
  /** Arabic gloss shown next to the French label. */
  labelAr?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

export function TextField({
  label,
  labelAr,
  error,
  hint,
  required,
  className,
  ...props
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cx("space-y-1.5", className)}>
      <Label htmlFor={id} label={label} labelAr={labelAr} required={required} />
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={shell(Boolean(error))}
        {...props}
      />
      <FieldFooter id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({
  label,
  labelAr,
  error,
  hint,
  required,
  className,
  ...props
}: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cx("space-y-1.5", className)}>
      <Label htmlFor={id} label={label} labelAr={labelAr} required={required} />
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(shell(Boolean(error)), "min-h-24 resize-y")}
        {...props}
      />
      <FieldFooter id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  labelAr,
  error,
  hint,
  required,
  className,
  children,
  ...props
}: BaseProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cx("space-y-1.5", className)}>
      <Label htmlFor={id} label={label} labelAr={labelAr} required={required} />
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(shell(Boolean(error)), "appearance-none pr-11")}
          {...props}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-ink-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <FieldFooter id={id} error={error} hint={hint} />
    </div>
  );
}

/** Styled radio / checkbox row. */
export function ChoiceCard({
  type = "radio",
  name,
  value,
  checked,
  onChange,
  title,
  titleAr,
  description,
  price,
  disabled,
}: {
  type?: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  titleAr?: string;
  description?: string;
  price?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cx(
        "group relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
        checked
          ? "border-gold-500 bg-gold-500/10 ring-1 ring-gold-500/40"
          : "border-ink-600 bg-ink-800/60 hover:border-gold-600/60 hover:bg-ink-800",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only-focusable peer"
      />
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked ? "border-gold-400 bg-gold-400" : "border-cream-300/40 bg-transparent",
        )}
      >
        {checked ? (
          type === "radio" ? (
            <span className="h-2 w-2 rounded-full bg-ink-900" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-900" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-cream-50">{title}</span>
          {titleAr ? <span className="ar text-xs text-cream-300/70">{titleAr}</span> : null}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-cream-300/60">{description}</span>
        ) : null}
      </span>

      {price ? (
        <span className="shrink-0 text-sm font-semibold text-gold-300">{price}</span>
      ) : null}
    </label>
  );
}

/** Segmented size / option picker. */
export function ChipGroup<T extends string>({
  label,
  labelAr,
  options,
  value,
  onChange,
  error,
  hint,
  columns = "auto",
}: {
  label: string;
  labelAr?: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
  columns?: "auto" | "2" | "3";
}) {
  const id = useId();
  const gridCols = {
    auto: "flex flex-wrap gap-2",
    "2": "grid grid-cols-2 gap-2",
    "3": "grid grid-cols-3 gap-2",
  }[columns];

  return (
    <div className="space-y-1.5" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-cream-100">{label}</span>
        {labelAr ? <span className="ar text-xs text-cream-300/60">{labelAr}</span> : null}
        {error ? (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        ) : null}
      </span>

      <div className={gridCols}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={cx(
                "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                selected
                  ? "border-gold-500 bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/40"
                  : "border-ink-600 bg-ink-800/60 text-cream-200 hover:border-gold-600/60 hover:text-cream-50",
              )}
            >
              {option.label}
              {option.hint ? (
                <span className="mt-0.5 block text-[0.65rem] font-normal text-cream-300/60">
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-cream-300/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Multi-select variant of {@link ChipGroup}, used where several options can be
 * active at once (product sizes). Kept as a sibling rather than a boolean prop
 * so single- and multi-select stay visually identical.
 */
export function MultiChipGroup<T extends string>({
  label,
  labelAr,
  options,
  values,
  onChange,
  error,
  hint,
  columns = "auto",
}: {
  label: string;
  labelAr?: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  values: ReadonlyArray<T>;
  onChange: (values: T[]) => void;
  error?: string;
  hint?: string;
  columns?: "auto" | "2" | "3";
}) {
  const id = useId();
  const gridCols = {
    auto: "flex flex-wrap gap-2",
    "2": "grid grid-cols-2 gap-2",
    "3": "grid grid-cols-3 gap-2",
  }[columns];

  function toggle(value: T) {
    onChange(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
    );
  }

  return (
    <div className="space-y-1.5" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-cream-100">{label}</span>
        {labelAr ? <span className="ar text-xs text-cream-300/60">{labelAr}</span> : null}
        {error ? (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        ) : null}
      </span>

      <div className={gridCols}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              aria-pressed={selected}
              className={cx(
                "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                selected
                  ? "border-gold-500 bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/40"
                  : "border-ink-600 bg-ink-800/60 text-cream-200 hover:border-gold-600/60 hover:text-cream-50",
              )}
            >
              {option.label}
              {option.hint ? (
                <span className="mt-0.5 block text-[0.65rem] font-normal text-cream-300/60">
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-cream-300/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Label({
  htmlFor,
  label,
  labelAr,
  required,
}: {
  htmlFor: string;
  label: string;
  labelAr?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline gap-2">
      <span className="text-sm font-medium text-cream-100">{label}</span>
      {labelAr ? <span className="ar text-xs text-cream-300/60">{labelAr}</span> : null}
      {required ? (
        <span className="text-xs text-gold-400" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldFooter({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} role="alert" className="text-xs text-danger">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-xs text-cream-300/60">
        {hint}
      </p>
    );
  }
  return null;
}
