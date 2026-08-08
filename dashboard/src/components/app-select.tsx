"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

export type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  options: AppSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

const emptyValue = "__lenslayer_empty_value__";

function toRadixValue(value: string | undefined) {
  return value === "" ? emptyValue : value;
}

function fromRadixValue(value: string) {
  return value === emptyValue ? "" : value;
}

export function AppSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  id,
  name,
  ariaLabel,
  className = "",
  disabled = false,
  required = false,
}: AppSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selectedValue = value ?? internalValue;

  return (
    <>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <Select.Root
        value={toRadixValue(selectedValue)}
        onValueChange={(nextValue) => {
          const next = fromRadixValue(nextValue);
          setInternalValue(next);
          onValueChange?.(next);
        }}
        disabled={disabled}
        required={required}
      >
        <Select.Trigger
          id={id}
          className={`app-select-trigger ${className}`.trim()}
          aria-label={ariaLabel}
        >
          <Select.Value />
          <Select.Icon className="app-select-icon">
            <ChevronDown aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="app-select-content"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
          >
            <Select.Viewport className="app-select-viewport">
              {options.map((option) => (
                <Select.Item
                  className="app-select-item"
                  disabled={option.disabled}
                  key={option.value}
                  value={toRadixValue(option.value) ?? emptyValue}
                >
                  <Select.ItemIndicator className="app-select-check">
                    <Check aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </>
  );
}
