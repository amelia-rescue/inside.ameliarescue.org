import { describe, expect, it } from "vitest";
import { extractIssues, getFieldId, hasIssues } from "./issues";
import type { TruckCheckSchema } from "./truck-check-schema-store";

const schema: TruckCheckSchema = {
  schemaId: "schema-1",
  version: 1,
  title: "Test Schema",
  createdAt: "2025-01-01T00:00:00.000Z",
  created_by: "user-1",
  sections: [
    {
      id: "zoll",
      title: "Zoll",
      fields: [
        { type: "checkbox", label: "Defib pads", required: true },
        { type: "checkbox", label: "Spare paper", required: true },
        { type: "text", label: "Notes" },
      ],
    },
    {
      id: "cab",
      title: "Cab",
      fields: [
        { type: "checkbox", label: "Cell phone", required: true },
        { type: "text", label: "Comments" },
        { type: "number", label: "Mileage" },
        { type: "photo", label: "Damage photos" },
      ],
    },
  ],
};

describe("getFieldId", () => {
  it("slugifies the label and prefixes the section id", () => {
    expect(getFieldId("zoll", "Defib pads")).toBe("zoll-defib-pads");
  });
});

describe("extractIssues", () => {
  it("returns no issues for an empty check", () => {
    const issues = extractIssues({ data: {}, schema });
    expect(issues).toEqual({
      problemSections: [],
      textNotes: [],
      photos: [],
      problemCount: 0,
    });
    expect(hasIssues(issues)).toBe(false);
  });

  it("ignores checked and unchecked checkboxes", () => {
    const issues = extractIssues({
      data: { "zoll-defib-pads": true, "zoll-spare-paper": null },
      schema,
    });
    expect(issues.problemCount).toBe(0);
  });

  it("collects not-present checkboxes grouped by section", () => {
    const issues = extractIssues({
      data: {
        "zoll-defib-pads": "not-present",
        "zoll-spare-paper": true,
        "cab-cell-phone": "not-present",
      },
      schema,
    });

    expect(issues.problemCount).toBe(2);
    expect(issues.problemSections).toEqual([
      {
        sectionTitle: "Zoll",
        fields: [{ fieldId: "zoll-defib-pads", label: "Defib pads" }],
      },
      {
        sectionTitle: "Cab",
        fields: [{ fieldId: "cab-cell-phone", label: "Cell phone" }],
      },
    ]);
    expect(hasIssues(issues)).toBe(true);
  });

  it("collects non-empty trimmed text notes and skips blank ones", () => {
    const issues = extractIssues({
      data: { "zoll-notes": "  low stock  ", "cab-comments": "   " },
      schema,
    });

    expect(issues.textNotes).toEqual([
      {
        fieldId: "zoll-notes",
        sectionTitle: "Zoll",
        label: "Notes",
        value: "low stock",
      },
    ]);
    expect(hasIssues(issues)).toBe(true);
  });

  it("ignores non-checkbox, non-text, non-photo fields", () => {
    const issues = extractIssues({
      data: { "cab-mileage": 1234 },
      schema,
    });
    expect(hasIssues(issues)).toBe(false);
  });

  it("collects photo urls and skips blank entries", () => {
    const issues = extractIssues({
      data: {
        "cab-damage-photos": [
          "https://cdn.example.com/a.jpg",
          "  ",
          "https://cdn.example.com/b.jpg",
        ],
      },
      schema,
    });

    expect(issues.photos).toEqual([
      {
        fieldId: "cab-damage-photos",
        sectionTitle: "Cab",
        label: "Damage photos",
        urls: [
          "https://cdn.example.com/a.jpg",
          "https://cdn.example.com/b.jpg",
        ],
      },
    ]);
  });

  it("does not treat photos alone as an issue", () => {
    const issues = extractIssues({
      data: { "cab-damage-photos": ["https://cdn.example.com/a.jpg"] },
      schema,
    });
    expect(hasIssues(issues)).toBe(false);
  });
});
