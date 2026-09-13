import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { sync, submit, revalidator, routeData } = vi.hoisted(() => ({
  sync: {} as any,
  submit: vi.fn(),
  revalidator: { revalidate: vi.fn() },
  routeData: {
    user: { user_id: "a" },
    truckCheck: {
      id: "check",
      created_by: "a",
      locked: false,
      created_at: "2026-09-13",
      data: {},
      contributors: {},
    },
    truck: { displayName: "Medic" },
    schema: {
      sections: [
        {
          id: "s",
          title: "Equipment",
          fields: [
            { type: "checkbox", label: "Oxygen", required: true },
            { type: "photo", label: "Issue photos", maxPhotos: 3 },
          ],
        },
      ],
    },
    previousContributors: [],
  },
}));
vi.mock("~/lib/truck-check/use-truck-check-sync", () => ({
  useTruckCheckSync: () => sync,
}));
vi.mock("~/lib/truck-check/image-compression", () => ({
  compressImage: async (file: File) => file,
}));
vi.mock("~/lib/truck-check/issue-notifications", () => ({
  notifyTruckCheckIssues: vi.fn(),
}));
vi.mock("~/components/date-display", () => ({ DateDisplay: () => null }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useLoaderData: () => routeData,
  useNavigation: () => ({}),
  useRevalidator: () => revalidator,
  useSubmit: () => submit,
  Form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
}));
import TruckCheckDynamic from "./truck-check-dynamic";
beforeEach(() => {
  Object.assign(sync, {
    snapshot: {
      id: "check",
      userId: "a",
      revision: 0,
      locked: false,
      data: {},
      contributors: {},
    },
    values: {},
    pending: [],
    ready: true,
    reachable: true,
    live: "disconnected",
    error: null,
    storageError: null,
    authRequired: false,
    missing: false,
    preparing: false,
    edit: vi.fn(),
    retry: vi.fn(),
    addPhoto: vi.fn(),
    dismiss: vi.fn(),
    prepareLock: vi.fn().mockResolvedValue(false),
  });
  submit.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
it("shows server save status independently of a disconnected websocket", () => {
  render(<TruckCheckDynamic />);
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  fireEvent.click(screen.getByRole("checkbox", { hidden: true }));
  expect(sync.edit).toHaveBeenCalledWith("s-oxygen", true);
});
it("keeps the pending indicator out of the checkbox layout", () => {
  const view = render(<TruckCheckDynamic />);
  const checkbox = screen.getByRole("checkbox", { hidden: true });
  const field = checkbox.parentElement!.parentElement!;
  const originalClass = field.className;

  sync.pending = [
    { clientId: "c", sequence: 1, fieldId: "s-oxygen", value: true },
  ];
  view.rerender(<TruckCheckDynamic />);

  const indicator = screen.getByRole("img", { name: "Oxygen: Pending save" });
  expect(indicator).toHaveClass("absolute", "right-2", "h-1.5", "w-1.5");
  expect(field).toHaveClass("relative", "pr-6");
  expect(field.className).toBe(originalClass);
  expect(screen.queryByText("Pending save")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { hidden: true })).toBe(checkbox);

  sync.pending = [];
  view.rerender(<TruckCheckDynamic />);
  expect(indicator).toHaveClass("opacity-0");
  expect(indicator).toHaveAttribute("aria-hidden", "true");
  expect(field.className).toBe(originalClass);
});

it("shows pending and rejected work rather than claiming it is saved", () => {
  sync.pending = [
    { clientId: "c", sequence: 1, fieldId: "s-oxygen", value: true },
  ];
  sync.reachable = false;
  const view = render(<TruckCheckDynamic />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "1 change saved on this device",
  );
  sync.snapshot = { ...sync.snapshot, locked: true };
  view.rerender(<TruckCheckDynamic />);
  expect(screen.getByRole("status")).toHaveTextContent("Needs attention");
  expect(
    screen.getByText("Unsaved changes on this device"),
  ).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { hidden: true })).toBeDisabled();
});
it("does not submit the lock until the sync controller confirms it is safe", async () => {
  const { container } = render(<TruckCheckDynamic />);
  const form = (
    container.querySelector('input[value="lock"]') as HTMLInputElement
  ).form!;
  fireEvent.submit(form);
  await waitFor(() => expect(sync.prepareLock).toHaveBeenCalledTimes(1));
  expect(submit).not.toHaveBeenCalled();
  sync.prepareLock.mockResolvedValue(true);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(form, { method: "post" }),
  );
});
it("queues each successfully uploaded photo even if a later upload fails", async () => {
  let upload = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options.method === "POST")
        return Response.json({
          uploadUrl: "https://example.test/upload",
          fileUrl: "https://example.test/files/truck-check-images/photo.jpg",
        });
      return new Response(null, { status: ++upload === 1 ? 200 : 503 });
    }),
  );
  const { container } = render(<TruckCheckDynamic />);
  const input = container.querySelector('input[type="file"][multiple]')!;
  fireEvent.change(input, {
    target: {
      files: [
        new File(["photo"], "one.jpg", { type: "image/jpeg" }),
        new File(["photo"], "two.jpg", { type: "image/jpeg" }),
      ],
    },
  });
  await waitFor(() => expect(sync.addPhoto).toHaveBeenCalledTimes(1));
  expect(sync.addPhoto).toHaveBeenCalledWith(
    "s-issue-photos",
    "https://example.test/files/truck-check-images/photo.jpg",
    3,
  );
  await waitFor(() =>
    expect(screen.getByText("Failed to upload two.jpg")).toBeInTheDocument(),
  );
});
