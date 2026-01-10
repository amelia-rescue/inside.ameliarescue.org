import { describe, expect, it, vi } from "vitest";
import CreateUser from "./create-user";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Route } from "./+types/create-user";

describe("create-user form", () => {
  it("should render the form", async () => {
    const mockProps = {
      loaderData: {
        user: {
          id: "test-user-id",
          email: "test@example.com",
          givenName: "Test",
          familyName: "User",
          accessToken: "mock-access-token",
          idToken: "mock-id-token",
          expiresAt: Date.now() + 3600000,
        },
      },
      params: {},
      matches: [],
    } as unknown as Route.ComponentProps;

    render(
      <MemoryRouter>
        <CreateUser {...mockProps} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /new user information/i }),
    ).toBeInTheDocument();
  });
});
