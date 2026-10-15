import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OneTimeCredential } from "./one-time-credential";

const token = "ll_agent_synthetic_clipboard_test_only";
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalCommand = Object.getOwnPropertyDescriptor(document, "execCommand");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (originalCommand) Object.defineProperty(document, "execCommand", originalCommand);
  else Reflect.deleteProperty(document, "execCommand");
});

function show(clipboard: unknown, command: () => boolean) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(command) });
  const view = render(<OneTimeCredential token={token} dismiss={vi.fn()} />);
  return { ...view, input: screen.getByLabelText("Agent bearer credential") as HTMLInputElement };
}

function expectSelected(input: HTMLInputElement) {
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(token.length);
}

it("copies the selected credential when the browser rejects async clipboard access", async () => {
  const { input } = show({ writeText: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) }, () => true);
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Credential copied.");
  expect(document.execCommand).toHaveBeenCalledWith("copy");
  expectSelected(input);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each([false, "throws"])("selects the credential for manual copying when Clipboard API is absent and fallback %s", async (outcome) => {
  const { input } = show(undefined, () => { if (outcome === "throws") throw new Error("Unavailable"); return false; });
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Press ⌘C on Mac or Ctrl+C on Windows/Linux");
  expectSelected(input);
  expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("selects the whole read-only credential when its field is clicked", () => {
  const { input } = show(undefined, () => false);
  fireEvent.click(input);
  expectSelected(input);
});

it("does not copy another selection when clipboard rejection arrives after dismissal", async () => {
  let reject!: (reason: Error) => void;
  show({ writeText: () => new Promise<void>((_, fail) => { reject = fail; }) }, () => true);
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  cleanup();
  await act(async () => { reject(new Error("Delayed denial")); });
  expect(document.execCommand).not.toHaveBeenCalled();
});

it("allows only one pending copy of the displayed credential", async () => {
  let resolve!: () => void;
  const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  show({ writeText }, () => false);
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  const pending = screen.getByRole("button", { name: "Copying…" });
  expect(pending).toBeDisabled();
  fireEvent.click(pending);
  expect(writeText).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(); });
  expect(screen.getByRole("status")).toHaveTextContent("Credential copied.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores an old rejection after the displayed credential changes and its new copy succeeds", async () => {
  let reject!: (error: Error) => void;
  const writeText = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValueOnce(undefined);
  const { rerender } = show({ writeText }, () => true);
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  const nextToken = "ll_agent_other_synthetic_clipboard_test_only";
  rerender(<OneTimeCredential token={nextToken} dismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Credential copied.");
  await act(async () => { reject(new Error("Old denial")); });
  expect(document.execCommand).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  expect(writeText).toHaveBeenLastCalledWith(nextToken);
});
