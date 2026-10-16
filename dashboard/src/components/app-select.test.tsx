import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import "@/test/select-option";
import { AppSelect } from "./app-select";
import { NativeSelect } from "./native-select";

const options = [{ value: "", label: "Select a member", disabled: true },
  { value: "owner", label: "Riley, owner" }, { value: "reviewer", label: "Morgan, reviewer" },
  { value: "revoked", label: "Revoked member", disabled: true }];

function field(extra: Partial<Parameters<typeof AppSelect>[0]> = {}) {
  return <div className="field"><label htmlFor={extra.id ?? "member"}>Assignee</label><AppSelect id="member" name="assignee_id" defaultValue="" options={options} {...extra} /></div>;
}
function choose(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Assignee" }), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: label }));
}

it("selects a named option once, submits its exact ID and uses the same menu for the legacy import alias", () => {
  const changed = vi.fn();
  const { container } = render(<form>{field({ onValueChange: changed })}<NativeSelect ariaLabel="Legacy" options={[{ value: "yes", label: "Yes" }]} /></form>);
  choose("Morgan, reviewer");
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Morgan, reviewer");
  expect(changed).toHaveBeenCalledExactlyOnceWith("reviewer");
  const form = container.querySelector("form")!;
  expect(new FormData(form).getAll("assignee_id")).toEqual(["reviewer"]);
  expect(container.querySelectorAll('input[type="hidden"][name="assignee_id"]')).toHaveLength(0);
  expect(container.querySelectorAll('select[name="assignee_id"]')).toHaveLength(1);
  expect(screen.getByRole("combobox", { name: "Legacy" })).toHaveTextContent("Yes");
});

it("does not let an encoded empty placeholder satisfy required; invalid submission focuses the labelled trigger", () => {
  const submit = vi.fn((event) => event.preventDefault());
  const { container } = render(<form onSubmit={submit}>{field({ required: true, "aria-describedby": "help" })}<p id="help">Choose the approved assignee only.</p><button>Submit</button></form>);
  const form = container.querySelector("form")!;
  const native = container.querySelector<HTMLSelectElement>("select[data-app-select-bridge]")!;
  expect(native.validity.valueMissing).toBe(true);
  expect(form.checkValidity()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(submit).not.toHaveBeenCalled();
  const trigger = screen.getByRole("combobox", { name: "Assignee" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAccessibleDescription(/Choose the approved assignee only/);
  expect(screen.getByRole("alert")).toHaveTextContent("Choose an option.");
  choose("Riley, owner");
  expect(form.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("excludes disabled controls from FormData/validation and never selects a disabled option", () => {
  const changed = vi.fn();
  const { container, rerender } = render(<form>{field({ onValueChange: changed })}</form>);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Assignee" }), { key: "ArrowDown" });
  const revoked = screen.getByRole("option", { name: "Revoked member" });
  expect(revoked).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(revoked);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.keyDown(revoked, { key: "Escape" });
  rerender(<form>{field({ value: "owner", required: true, disabled: true })}</form>);
  expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
  expect(new FormData(container.querySelector("form")!).has("assignee_id")).toBe(false);
  expect(container.querySelector("form")!.checkValidity()).toBe(true);
});

it("tracks fieldset disable even for a portaled open menu, retaining the first-legend exception", async () => {
  const changed = vi.fn();
  const { container } = render(<form><fieldset><legend>{field({ id: "legend-member", ariaLabel: "Legend choice", name: "legend", defaultValue: "owner" })}</legend>{field({ onValueChange: changed, required: true })}</fieldset></form>);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Assignee" }), { key: "ArrowDown" });
  const fieldset = container.querySelector("fieldset")!;
  act(() => { fieldset.disabled = true; });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(screen.getByRole("combobox", { name: "Assignee" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Legend choice" })).not.toBeDisabled();
  expect(new FormData(container.querySelector("form")!).has("assignee_id")).toBe(false);
  expect(new FormData(container.querySelector("form")!).get("legend")).toBe("owner");
  act(() => { fieldset.disabled = false; });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" })).toBeEnabled());
  choose("Riley, owner");
  expect(changed).toHaveBeenCalledExactlyOnceWith("owner");
});

it("form.reset restores both uncontrolled display and FormData without an onValueChange notification", async () => {
  const changed = vi.fn();
  const { container } = render(<form>{field({ defaultValue: "owner", onValueChange: changed })}</form>);
  choose("Morgan, reviewer");
  const form = container.querySelector("form")!;
  act(() => { form.reset(); });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Riley, owner"));
  expect(new FormData(form).get("assignee_id")).toBe("owner");
  expect(changed).toHaveBeenCalledTimes(1);
});

it("resets a required empty default back to invalid rather than choosing an unauthorized target", async () => {
  const { container } = render(<form>{field({ required: true })}</form>);
  choose("Riley, owner");
  act(() => { container.querySelector("form")!.reset(); });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Select a member"));
  expect(container.querySelector<HTMLSelectElement>("select[data-app-select-bridge]")!.value).toBe("");
  expect(container.querySelector("form")!.checkValidity()).toBe(false);
});

it("supports external form association, controlled state and parent-owned reset", async () => {
  function Controlled() {
    const [value, setValue] = useState("owner");
    return <><form id="external" onReset={() => setValue("owner")} />{field({ form: "external", value, onValueChange: setValue })}</>;
  }
  render(<Controlled />);
  choose("Morgan, reviewer");
  const form = document.getElementById("external") as HTMLFormElement;
  expect(new FormData(form).get("assignee_id")).toBe("reviewer");
  act(() => { form.reset(); });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Riley, owner"));
  expect(new FormData(form).get("assignee_id")).toBe("owner");
});

it("does not silently replace a removed controlled scope and preserves empty optional values", () => {
  const { container, rerender } = render(<form>{field({ value: "owner" })}</form>);
  rerender(<form>{field({ required: true, value: "owner", options: options.filter(option => option.value !== "owner") })}</form>);
  expect(container.querySelector("form")!.checkValidity()).toBe(false);
  expect(new FormData(container.querySelector("form")!).get("assignee_id")).not.toBe("reviewer");
  rerender(<form>{field({ value: "", options: [{ value: "", label: "Unassigned" }, ...options.slice(1)] })}</form>);
  expect(new FormData(container.querySelector("form")!).getAll("assignee_id")).toEqual([""]);
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Unassigned");
});

it("keeps controlled values authoritative on reset unless the parent changes them", async () => {
  const changed = vi.fn();
  const { container, rerender } = render(<form>{field({ value: "owner", onValueChange: changed })}</form>);
  rerender(<form>{field({ value: "reviewer", onValueChange: changed })}</form>);
  act(() => { container.querySelector("form")!.reset(); });
  await waitFor(() => expect(new FormData(container.querySelector("form")!).get("assignee_id")).toBe("reviewer"));
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Morgan, reviewer");
  expect(changed).not.toHaveBeenCalled();
});

it("honors a cancelled reset and resets to an updated uncontrolled default only on reset", async () => {
  const cancel = vi.fn((event) => event.preventDefault());
  const { container, rerender } = render(<form onReset={cancel}>{field({ defaultValue: "owner" })}</form>);
  choose("Morgan, reviewer");
  act(() => { container.querySelector("form")!.reset(); });
  await act(async () => {});
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Morgan, reviewer");
  rerender(<form>{field({ defaultValue: "reviewer" })}</form>);
  choose("Riley, owner");
  expect(new FormData(container.querySelector("form")!).get("assignee_id")).toBe("owner");
  act(() => { container.querySelector("form")!.reset(); });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Morgan, reviewer"));
});

it("uses ordinary first-option defaults and does not collide with old sentinel-like application IDs", () => {
  const { container } = render(<form>{field({ defaultValue: undefined, options: [
    { value: "value:", label: "Unavailable first", disabled: true },
    { value: "__lenslayer_empty_value__", label: "Literal application ID" },
    { value: "", label: "No assignee" },
  ] })}</form>);
  const form = container.querySelector("form")!;
  expect(new FormData(form).get("assignee_id")).toBe("__lenslayer_empty_value__");
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Literal application ID");
  choose("No assignee");
  expect(new FormData(form).get("assignee_id")).toBe("");
});

it("updates validation descriptions when a controlled choice arrives without submitting a hidden sentinel", () => {
  const { container, rerender } = render(<form>{field({ value: "", required: true })}</form>);
  act(() => { container.querySelector("form")!.reportValidity(); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  rerender(<form>{field({ value: "owner", required: true })}</form>);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Assignee" })).not.toHaveAttribute("aria-invalid", "true");
});

it("preserves an uncontrolled initial selection after option reorder, including async arrival", () => {
  const { container, rerender } = render(<form>{field({ defaultValue: undefined, options: [] })}</form>);
  rerender(<form>{field({ defaultValue: undefined, options: options.slice(1) })}</form>);
  expect(new FormData(container.querySelector("form")!).get("assignee_id")).toBe("owner");
  rerender(<form>{field({ defaultValue: undefined, options: [options[2], options[1]] })}</form>);
  expect(new FormData(container.querySelector("form")!).get("assignee_id")).toBe("owner");
  expect(screen.getByRole("combobox", { name: "Assignee" })).toHaveTextContent("Riley, owner");
});

it("supports typeahead, arrows/Enter and Escape with focus returning to the trigger", async () => {
  const user = userEvent.setup();
  render(<>{field({ defaultValue: "owner" })}<button>Next control</button></>);
  await user.tab();
  const trigger = screen.getByRole("combobox", { name: "Assignee" });
  expect(trigger).toHaveFocus();
  await user.keyboard("m");
  expect(trigger).toHaveTextContent("Morgan, reviewer");
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("listbox");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.keyboard("{ArrowUp}");
  await screen.findByRole("listbox");
  await user.keyboard("{Home}{Enter}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveTextContent("Riley, owner");
});
