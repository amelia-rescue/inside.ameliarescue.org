import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Test, { loader, action } from "./test";

// Mock react-router's useLoaderData while preserving other exports
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLoaderData: vi.fn(() => ({
      thing: { x: "test value" },
    })),
  };
});

describe("Test Route", () => {
  describe("Component", () => {
    it("renders the test page heading", () => {
      render(<Test />);
      expect(
        screen.getByRole("heading", { name: /test page/i }),
      ).toBeInTheDocument();
    });

    it("displays the context value", () => {
      render(<Test />);
      expect(
        screen.getByText(/context value: test value/i),
      ).toBeInTheDocument();
    });

    it("shows fallback text when context value is missing", async () => {
      const { useLoaderData } = await import("react-router");
      vi.mocked(useLoaderData).mockReturnValueOnce({ thing: null });

      render(<Test />);
      expect(screen.getByText(/no context value found/i)).toBeInTheDocument();
    });
  });

  describe("Loader", () => {
    it("returns thing object with x property", async () => {
      const result = await loader({
        context: {} as any,
        params: {},
        request: new Request("http://localhost/test"),
        unstable_pattern: "/test",
      });

      expect(result).toEqual({
        thing: {
          x: "lol",
        },
      });
    });
  });

  describe("Action", () => {
    it("handles POST requests successfully", async () => {
      const request = new Request("http://localhost/test", {
        method: "POST",
      });

      const response = await action({
        request,
        context: {} as any,
        params: {},
        unstable_pattern: "/test",
      });

      expect(response).toBeDefined();

      if (response) {
        const data = await response.json();

        expect(data).toMatchObject({
          message: "Hello from POST endpoint",
          method: "POST",
          status: "success",
        });
        expect(data.timestamp).toBeDefined();
        expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
      }
    });

    it("returns undefined for non-POST requests", async () => {
      const request = new Request("http://localhost/test", {
        method: "GET",
      });

      const response = await action({
        request,
        context: {} as any,
        params: {},
        unstable_pattern: "/test",
      });

      expect(response).toBeUndefined();
    });
  });
});
