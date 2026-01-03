# Testing Setup

This project uses **Vitest** with **React Testing Library** for unit and integration testing.

## Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI (visual test runner)
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

Tests are located alongside their source files with a `.test.tsx` or `.test.ts` extension:

```
app/
  routes/
    test.tsx          # Component
    test.test.tsx     # Tests for component
```

## Writing Tests

### Testing Components

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

### Testing Loaders

```typescript
describe("Loader", () => {
  it("returns expected data", async () => {
    const result = await loader({
      context: {} as any,
      params: {},
      request: new Request("http://localhost/test"),
    });

    expect(result).toEqual({ data: "expected" });
  });
});
```

### Testing Actions

```typescript
describe("Action", () => {
  it("handles POST requests", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    const response = await action({
      request,
      context: {} as any,
      params: {},
    });

    expect(response).toBeDefined();
    const data = await response!.json();
    expect(data.status).toBe("success");
  });
});
```

## Mocking

### Mocking react-router hooks

```typescript
vi.mock("react-router", () => ({
  useLoaderData: vi.fn(() => ({ data: "mocked" })),
  useNavigate: vi.fn(),
}));
```

### Mocking modules

```typescript
vi.mock("~/lib/auth.server", () => ({
  getUser: vi.fn(() => null),
  requireUser: vi.fn(),
}));
```

## Coverage

Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`.

## CI/CD Integration

For CI pipelines, use:
```bash
npm run test:run
```

This runs tests once and exits, perfect for automated builds.
