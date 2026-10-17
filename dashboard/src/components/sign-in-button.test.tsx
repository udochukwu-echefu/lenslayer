import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signIn } from "next-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicAccessEnabled } from "@/lib/api";
import { AuthEntry } from "./auth-entry";
import { SignInButton } from "./sign-in-button";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth", () => ({ oidcEmailConnection: "Configured-Email-Database" }));
vi.mock("@/lib/api", () => ({ isPublicAccessEnabled: vi.fn() }));

describe("SignInButton", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
    vi.mocked(isPublicAccessEnabled).mockReturnValue(false);
  });

  it("starts the Auth0 Google connection directly", () => {
    render(<SignInButton callbackUrl="/contracts" configured method="google" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/contracts" }, { connection: "google-oauth2" });
  });

  it.each(["signin", "signup"] as const)("routes email/password %s to the default database connection", async (mode) => {
    render(<SignInButton callbackUrl="/invite/synthetic" configured mode={mode} method="email" />);
    fireEvent.click(screen.getByRole("button", { name: mode === "signup" ? "Sign up with email and password" : "Sign in with email and password" }));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/invite/synthetic" }, {
      connection: "Username-Password-Authentication",
      ...(mode === "signup" ? { screen_hint: "signup" } : {}),
    });
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it.each(["signin", "signup"] as const)("passes the server connection through AuthEntry for %s without changing Google", async (mode) => {
    const { container } = render(<AuthEntry callbackUrl="/contracts" configured mode={mode} />);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText(/reset a forgotten password there/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /with email and password/ }));
    expect(signIn).toHaveBeenLastCalledWith("oidc", { callbackUrl: "/contracts" }, {
      connection: "Configured-Email-Database",
      ...(mode === "signup" ? { screen_hint: "signup" } : {}),
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signIn).toHaveBeenLastCalledWith("oidc", { callbackUrl: "/contracts" }, {
      connection: "google-oauth2",
      ...(mode === "signup" ? { screen_hint: "signup" } : {}),
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
  });

  it.each(["signin", "signup"] as const)("keeps generic Auth0 %s connection-neutral", async (mode) => {
    render(<SignInButton callbackUrl="/contracts" configured mode={mode} emailConnection="Ignored-Database" />);
    fireEvent.click(screen.getByRole("button"));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/contracts" }, mode === "signup" ? { screen_hint: "signup" } : undefined);
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("disables email/password while pending, recovers from a returned error, and retries", async () => {
    let resolve!: (value: { error: string; status: number; ok: boolean; url: null }) => void;
    vi.mocked(signIn).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<SignInButton callbackUrl="/contracts" configured method="email" />);
    fireEvent.click(screen.getByRole("button"));
    const pending = screen.getByRole("button", { name: "Opening secure sign-in..." });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ error: "synthetic error", status: 400, ok: false, url: null }));
    expect(screen.getByRole("alert")).toHaveTextContent("Secure sign-in could not be opened");
    expect(screen.getByRole("button")).toBeEnabled();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it.each(["email", "google"] as const)("recovers from thrown %s errors", async (method) => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error("network unavailable"));
    render(<SignInButton callbackUrl="/contracts" configured method={method} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Secure sign-in could not be opened");
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("keeps the unconfigured demo fallback without starting authentication", () => {
    vi.mocked(isPublicAccessEnabled).mockReturnValue(true);
    render(<SignInButton callbackUrl="/contracts" configured={false} method="email" />);
    expect(screen.getByRole("link", { name: /Open the demo workspace/ })).toHaveAttribute("href", "/contracts");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("fails closed when unconfigured and demo access is disabled", () => {
    vi.mocked(isPublicAccessEnabled).mockReturnValue(false);
    render(<SignInButton callbackUrl="/contracts" configured={false} method="email" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Authentication is unavailable");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("recovers when the authorization request fails", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error("network unavailable"));
    render(<SignInButton callbackUrl="/contracts" configured method="google" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(screen.getByRole("button", { name: "Opening Google..." })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Secure sign-in could not be opened");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
  });
});
