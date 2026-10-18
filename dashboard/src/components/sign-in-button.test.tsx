import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signIn } from "next-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicAccessEnabled } from "@/lib/api";
import { AuthEntry } from "./auth-entry";
import { SignInButton } from "./sign-in-button";
import styles from "./auth-surface.module.css";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth", () => ({ oidcEmailConnection: "Configured-Email-Database" }));
vi.mock("@/lib/api", () => ({ isPublicAccessEnabled: vi.fn() }));

describe("SignInButton", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
    vi.mocked(isPublicAccessEnabled).mockReturnValue(false);
  });

  it.each([
    ["auth0", "button signin-button"],
    ["email", "button signin-button auth-email-button"],
    ["google", "button signin-button auth-google-button"],
  ] as const)("preserves the default %s presentation", (method, className) => {
    render(<SignInButton callbackUrl="/contracts" configured method={method} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("class", className);
    expect(button.parentElement).toHaveAttribute("class", "auth-signin-action");
    expect(button.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it.each(["auth0", "email", "google"] as const)("applies rounded %s styling only when requested", (method) => {
    render(<SignInButton callbackUrl="/contracts" configured method={method} appearance="rounded" />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass(styles.control);
    expect(button.parentElement).toHaveClass(styles.action);
    if (method === "google") expect(button).toHaveClass("auth-google-button", styles.google);
    if (method === "email") expect(button).toHaveClass("auth-email-button");
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
    expect(container.querySelector(".auth-main > .auth-editorial .auth-editorial-image")).toBeInTheDocument();
    expect(container.querySelector(".auth-main > .auth-access")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /with email and password/ })).not.toHaveClass(styles.control);
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

  it.each(["default", "rounded"] as const)("disables %s email/password while pending, recovers from a returned error, and retries", async (appearance) => {
    let resolve!: (value: { error: string; status: number; ok: boolean; url: null }) => void;
    vi.mocked(signIn).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<SignInButton callbackUrl="/contracts" configured method="email" appearance={appearance} />);
    fireEvent.click(screen.getByRole("button"));
    const pending = screen.getByRole("button", { name: "Opening secure sign-in..." });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending.querySelector(`.${styles.spinner}`) !== null).toBe(appearance === "rounded");
    fireEvent.click(pending);
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ error: "synthetic error", status: 400, ok: false, url: null }));
    expect(screen.getByRole("alert")).toHaveTextContent("Secure sign-in could not be opened");
    expect(screen.getByRole("alert")).toHaveClass(appearance === "rounded" ? styles.error : "auth-signin-error");
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
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

  it.each(["default", "rounded"] as const)("keeps the %s unconfigured demo fallback without starting authentication", (appearance) => {
    vi.mocked(isPublicAccessEnabled).mockReturnValue(true);
    render(<SignInButton callbackUrl="/contracts" configured={false} method="email" appearance={appearance} />);
    const link = screen.getByRole("link", { name: /Open the demo workspace/ });
    expect(link).toHaveAttribute("href", "/contracts");
    expect(link).toHaveAttribute("class", `button secondary${appearance === "rounded" ? ` ${styles.control}` : ""}`);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("uses the returning-session label without selecting a connection", async () => {
    render(<SignInButton callbackUrl="/contracts?review=active" configured label="Sign back in" appearance="rounded" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign back in" }));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/contracts?review=active" }, undefined);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign back in" })).toBeEnabled());
  });

  it.each(["signin", "signup"] as const)("preserves the callback when switching from %s", (mode) => {
    const callbackUrl = "/contracts?review=active&tab=evidence";
    render(<AuthEntry callbackUrl={callbackUrl} configured mode={mode} />);
    expect(screen.getByRole("link", { name: mode === "signin" ? "Create an account" : "Sign in" }))
      .toHaveAttribute("href", `${mode === "signin" ? "/signup" : "/signin"}?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  });

  it.each(["default", "rounded"] as const)("fails closed with %s appearance when unconfigured and demo access is disabled", (appearance) => {
    vi.mocked(isPublicAccessEnabled).mockReturnValue(false);
    render(<SignInButton callbackUrl="/contracts" configured={false} method="email" appearance={appearance} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Authentication is unavailable");
    expect(screen.getByRole("alert")).toHaveClass(appearance === "rounded" ? styles.configError : "auth-config-error");
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
