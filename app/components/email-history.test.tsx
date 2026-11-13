import { expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import {
  EmailHistory,
  LOAD_MORE_EMAILS_INTENT,
  shouldRevalidateEmailHistory,
} from "./email-history";
import type { EmailHistoryPage } from "~/lib/email-history.server";

function makePage(start: number, count: number, cursor?: string) {
  return {
    emails: Array.from({ length: count }, (_, i) => ({
      message_id: `msg-${start + i}`,
      subject: `Email ${start + i}`,
      status: "Delivery",
      sent_at: "2026-11-01T00:00:00.000Z",
      events: [],
    })),
    cursor,
  } satisfies EmailHistoryPage;
}

const pages: Record<string, EmailHistoryPage> = {
  "page-2": makePage(100, 100, "page-3"),
  "page-3": makePage(200, 50),
};

it("keeps every loaded page when loading more emails repeatedly", async () => {
  const Stub = createRoutesStub([
    {
      path: "/profile",
      // Returns a fresh first page on every call, like the real loader.
      loader: () => makePage(0, 100, "page-2"),
      action: async ({ request }) => {
        const formData = await request.formData();
        expect(formData.get("intent")).toBe(LOAD_MORE_EMAILS_INTENT);
        return { emailHistory: pages[String(formData.get("cursor"))] };
      },
      shouldRevalidate: shouldRevalidateEmailHistory,
      Component: function Profile({ loaderData }: any) {
        return <EmailHistory initial={loaderData} />;
      },
    },
  ]);
  render(<Stub initialEntries={["/profile"]} />);

  const subjects = () => screen.queryAllByText(/^Email \d+$/).length;
  const loadMore = () =>
    screen.findByRole(
      "button",
      { name: "Load more emails" },
      { timeout: 5000 },
    );

  await waitFor(() => expect(subjects()).toBe(100));
  expect(screen.getByText("100+")).toBeInTheDocument();

  fireEvent.click(await loadMore());
  await waitFor(() => expect(subjects()).toBe(200));

  fireEvent.click(await loadMore());
  await waitFor(() => expect(subjects()).toBe(250));

  expect(screen.getByText("250")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Load more emails" }),
  ).not.toBeInTheDocument();
});
