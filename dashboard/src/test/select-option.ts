import { fireEvent, screen } from "@testing-library/react";
import { afterAll, beforeAll, vi } from "vitest";

// jsdom has no scrolling geometry. Keep the real Radix keyboard/focus logic;
// provide only the browser methods it invokes, never a mocked select component.
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => {
  if (!scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterAll(() => {
  if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

export function selectOption(label: string, value: string) {
  const control = screen.getByRole("combobox", { name: label });
  const bridge = control.closest(".field")?.querySelector<HTMLSelectElement>("select[data-app-select-bridge]");
  const option = Array.from(bridge?.options ?? []).find((item) => item.value === value);
  if (!option) throw new Error(`No rendered option for ${label}`);
  fireEvent.keyDown(control, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: option.textContent ?? "" }));
}
