import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signIn } from "next-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInButton } from "./sign-in-button";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("SignInButton", () => {
  beforeEach(() => vi.mocked(signIn).mockReset());

  it("starts the Auth0 Google connection directly", () => {
    render(<SignInButton callbackUrl="/contracts" configured method="google" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/contracts" }, { connection: "google-oauth2" });
  });

  it("opens Auth0 email signup with the signup prompt", () => {
    render(<SignInButton callbackUrl="/" configured mode="signup" method="email" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up with email" }));
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/" }, { screen_hint: "signup" });
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
