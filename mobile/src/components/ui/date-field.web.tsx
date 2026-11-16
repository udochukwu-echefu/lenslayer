import { createElement } from "react";
import { dateKey } from "@/lib/format";
import { useTheme } from "@/theme/theme-provider";
import { Field } from "./form";

/** Browser preview: a plain HTML date/datetime input styled like the native field. */
export function DateField({ label, value, onChange, withTime, help }: { label: string; value: Date | null; onChange: (value: Date | null) => void; withTime?: boolean; help?: string; optional?: boolean }) {
  const { colors } = useTheme();
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = value ? (withTime ? `${dateKey(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}` : dateKey(value)) : "";
  return (
    <Field label={label} help={help}>
      {createElement("input", {
        type: withTime ? "datetime-local" : "date",
        value: text,
        "aria-label": label,
        onChange: (event: { target: { value: string } }) => {
          const next = event.target.value;
          onChange(next ? new Date(withTime ? next : `${next}T09:00:00`) : null);
        },
        style: { minHeight: 44, borderRadius: 10, border: `1px solid ${colors.lineStrong}`, background: colors.surface, color: colors.ink, padding: "0 12px", fontSize: 16 },
      })}
    </Field>
  );
}
