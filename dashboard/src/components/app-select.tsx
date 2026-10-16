"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import "./app-select.css";

export type AppSelectOption = { value: string; label: string; disabled?: boolean };
export type AppSelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "defaultValue" | "onChange" | "name"> & {
  options: AppSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  ariaLabel?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
};

// Encode every value, including "", without reserving a possible application ID.
const radixValue = (value: string) => `value:${value}`;

/** Radix owns the visible menu; one inaccessible native bridge owns form data,
 * constraint validation and reset defaults. No fabricated React change events. */
export function AppSelect({ options, value, defaultValue, onValueChange, id, name, form,
  ariaLabel, className = "", disabled = false, required = false, placeholder = "Choose an option",
  autoComplete = "off", "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...triggerProps }: AppSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  const [validationAttempted, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const controlled = value !== undefined;
  const firstValue = options.find((option) => !option.disabled)?.value ?? "";
  const requestedValue = controlled ? value : internalValue ?? firstValue;
  // Disappearing/foreign scope is not silently replaced with another target.
  const selectedValue = options.some((option) => option.value === requestedValue) ? requestedValue : "";
  const resetValue = controlled ? selectedValue : defaultValue ?? firstValue;
  const selected = options.find((option) => option.value === selectedValue);
  const isDisabled = disabled || fieldsetDisabled;
  const invalid = validationAttempted && required && selectedValue === "" && !isDisabled;

  useLayoutEffect(() => {
    const select = native.current;
    if (!select) return;
    // A controlled DOM value alone does not set HTML form.reset() defaults.
    for (const option of Array.from(select.options)) option.defaultSelected = option.value === resetValue;
    select.value = selectedValue;
    // Capture the native initial selection once async options arrive. Reordering
    // options later must not silently change an uncontrolled selection.
    const captureInitialSelection = () => {
      if (!controlled && internalValue === undefined && options.some((option) => !option.disabled)) setInternalValue(select.value);
    };
    captureInitialSelection();
  }, [resetValue, selectedValue, options, controlled, internalValue]);

  useEffect(() => {
    const select = native.current;
    if (!select) return;
    const synchronize = () => {
      const inherited = select.matches(":disabled") && !select.disabled;
      setFieldsetDisabled(inherited);
      if (inherited) setOpen(false);
    };
    const observer = new MutationObserver(synchronize);
    for (let parent = select.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "FIELDSET") observer.observe(parent, { attributes: true, attributeFilter: ["disabled"] });
    }
    synchronize();
    return () => observer.disconnect();
  }, [disabled]);

  useEffect(() => {
    const select = native.current;
    const owner = select?.form;
    if (!select || !owner) return;
    let mounted = true;
    const reset = (event: Event) => {
      // Wait until the native reset default action and any parent onReset have
      // completed. A controlled value remains the parent's responsibility.
      queueMicrotask(() => {
        if (!mounted || event.defaultPrevented) return;
        if (!controlled) setInternalValue(defaultValue);
        select.value = resetValue;
        setInvalid(false);
        setOpen(false);
      });
    };
    owner.addEventListener("reset", reset);
    return () => { mounted = false; owner.removeEventListener("reset", reset); };
  }, [controlled, defaultValue, resetValue, form]);

  function choose(next: string) {
    if (isDisabled || native.current?.matches(":disabled") || !options.some((option) => option.value === next && !option.disabled)) return;
    if (!controlled) setInternalValue(next);
    setInvalid(false);
    onValueChange?.(next);
  }

  return <>
    <select ref={native} data-app-select-bridge="" className="app-select-native-bridge" aria-hidden="true" tabIndex={-1}
      name={name} form={form} required={required} disabled={disabled} autoComplete={autoComplete} value={selectedValue}
      onChange={(event) => choose(event.currentTarget.value)}
      onInvalid={(event) => { event.preventDefault(); setInvalid(true); setOpen(false); trigger.current?.focus(); }}>
      {!options.some((option) => option.value === "") && <option value="" />}
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    {/* Radix's internal unnamed bridge is not our submission/validation control.
        In particular, encoded empty values must never satisfy required fields. */}
    <Select.Root value={selected ? radixValue(selectedValue) : ""} disabled={isDisabled} open={open}
      onOpenChange={(next) => { if (!next || (!isDisabled && !native.current?.matches(":disabled"))) setOpen(next); }}
      onValueChange={(next) => { if (next.startsWith("value:")) choose(next.slice(6)); }}>
      <Select.Trigger {...triggerProps} ref={trigger} id={id} className={`app-select-trigger ${className}`.trim()}
        aria-label={ariaLabel ?? triggerProps["aria-label"]} aria-required={required || undefined}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        aria-describedby={[describedBy, invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined}
        title={triggerProps.title ?? selected?.label}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="app-select-icon"><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="app-select-content" data-app-select-content="" position="popper" sideOffset={6} collisionPadding={12}>
          <Select.ScrollUpButton className="app-select-scroll"><ChevronUp aria-hidden="true" /></Select.ScrollUpButton>
          <Select.Viewport className="app-select-viewport">
            {options.map((option) => <Select.Item className="app-select-item" key={option.value} value={radixValue(option.value)} disabled={option.disabled} textValue={option.label}>
              <Select.ItemIndicator className="app-select-check"><Check aria-hidden="true" /></Select.ItemIndicator>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="app-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
    {invalid && <span id={errorId} className="app-select-error" role="alert">Choose an option.</span>}
  </>;
}
