import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

/** Keep native selection, validation and keyboard behavior with a consistent inset icon. */
export function NativeSelect({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="native-select">
    <select {...props} className={`input ${className}`.trim()}>{children}</select>
    <ChevronDown className="native-select-icon" aria-hidden="true" />
  </div>;
}
