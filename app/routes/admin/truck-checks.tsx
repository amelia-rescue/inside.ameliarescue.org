import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/truck-checks";
import { appContext } from "~/context";
import {
  TruckCheckSchemaStore,
  type Truck,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import { IoWarning } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manage Truck Checks - Admin - Amelia Rescue" },
    {
      name: "description",
      content: "Manage trucks and truck check schemas",
    },
  ];
}

export const handle = {
  breadcrumb: "Manage Truck Checks",
};

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }

  if (c.user.website_role !== "admin") {
    throw redirect("/");
  }

  const store = TruckCheckSchemaStore.make();
  const [trucks, schemas] = await Promise.all([
    store.listTrucks(),
    store.listSchemas(),
  ]);

  // Get unique schemas by schemaId (latest version only)
  const uniqueSchemas = schemas.reduce(
    (acc, schema) => {
      if (
        !acc[schema.schemaId] ||
        schema.createdAt > acc[schema.schemaId].createdAt
      ) {
        acc[schema.schemaId] = schema;
      }
      return acc;
    },
    {} as Record<string, TruckCheckSchema>,
  );

  return { ...c, trucks, schemas: Object.values(uniqueSchemas) };
}

const VALID_FIELD_TYPES = ["checkbox", "text", "number", "select", "photo"];
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateString(
  formData: FormData,
  key: string,
  label: string,
): string | { field: string; message: string } {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    return { field: key, message: `${label} is required` };
  }
  return value.trim();
}

function validateSectionsJson(json: string): {
  sections?: any[];
  error?: string;
} {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "Sections JSON is not valid JSON" };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Sections must be a JSON array" };
  }

  for (let i = 0; i < parsed.length; i++) {
    const section = parsed[i];
    if (!section.id || typeof section.id !== "string") {
      return {
        error: `Section ${i + 1}: "id" is required and must be a string`,
      };
    }
    if (!section.title || typeof section.title !== "string") {
      return {
        error: `Section ${i + 1} ("${section.id}"): "title" is required`,
      };
    }
    if (!Array.isArray(section.fields)) {
      return {
        error: `Section ${i + 1} ("${section.id}"): "fields" must be an array`,
      };
    }
    for (let j = 0; j < section.fields.length; j++) {
      const field = section.fields[j];
      if (!field.label || typeof field.label !== "string") {
        return {
          error: `Section "${section.id}", field ${j + 1}: "label" is required`,
        };
      }
      if (!field.type || !VALID_FIELD_TYPES.includes(field.type)) {
        return {
          error: `Section "${section.id}", field "${field.label}": "type" must be one of ${VALID_FIELD_TYPES.join(", ")}`,
        };
      }
      if (field.type === "select") {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          return {
            error: `Section "${section.id}", field "${field.label}": select fields must have a non-empty "options" array`,
          };
        }
        for (const opt of field.options) {
          if (!opt.value || !opt.label) {
            return {
              error: `Section "${section.id}", field "${field.label}": each option must have "value" and "label"`,
            };
          }
        }
      }
    }
  }

  return { sections: parsed };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const store = TruckCheckSchemaStore.make();

  try {
    if (intent === "create-truck" || intent === "update-truck") {
      const truckId = validateString(formData, "truckId", "Truck ID");
      const displayName = validateString(
        formData,
        "displayName",
        "Display Name",
      );
      const schemaId = validateString(formData, "schemaId", "Schema");

      if (typeof truckId !== "string")
        return data({ error: truckId.message }, { status: 400 });
      if (typeof displayName !== "string")
        return data({ error: displayName.message }, { status: 400 });
      if (typeof schemaId !== "string")
        return data({ error: schemaId.message }, { status: 400 });

      if (intent === "create-truck" && !SLUG_REGEX.test(truckId)) {
        return data(
          {
            error:
              "Truck ID must be lowercase alphanumeric with hyphens (e.g. medic-1)",
          },
          { status: 400 },
        );
      }

      const truck: Truck = { truckId, displayName, schemaId };
      if (intent === "create-truck") {
        await store.createTruck(truck);
      } else {
        await store.updateTruck(truck);
      }
      return { success: true, intent };
    }

    if (intent === "create-schema" || intent === "update-schema") {
      const title = validateString(formData, "title", "Title");
      if (typeof title !== "string")
        return data({ error: title.message }, { status: 400 });

      const sectionsJson = formData.get("sections");
      if (
        typeof sectionsJson !== "string" ||
        sectionsJson.trim().length === 0
      ) {
        return data({ error: "Sections JSON is required" }, { status: 400 });
      }

      const { sections, error: sectionsError } =
        validateSectionsJson(sectionsJson);
      if (sectionsError) {
        return data({ error: sectionsError }, { status: 400 });
      }

      const versionStr = formData.get("version");
      const version = parseInt(versionStr as string);
      if (isNaN(version) || version < 1) {
        return data(
          { error: "Version must be a positive number" },
          { status: 400 },
        );
      }

      if (intent === "create-schema") {
        await store.createSchema({ version, title, sections: sections! });
      } else {
        const schemaId = validateString(formData, "schemaId", "Schema ID");
        if (typeof schemaId !== "string")
          return data({ error: schemaId.message }, { status: 400 });
        await store.updateSchema({
          schemaId,
          version,
          title,
          sections: sections!,
        });
      }
      return { success: true, intent };
    }

    return data({ error: "Invalid intent" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}

export default function ManageTruckChecks({
  loaderData,
}: Route.ComponentProps) {
  const { trucks, schemas } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [activeTab, setActiveTab] = useState<"trucks" | "schemas">("trucks");

  // Truck form state
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [truckFormData, setTruckFormData] = useState({
    truckId: "",
    displayName: "",
    schemaId: "",
  });

  // Schema form state
  const [editingSchema, setEditingSchema] = useState<TruckCheckSchema | null>(
    null,
  );
  const [schemaFormData, setSchemaFormData] = useState({
    title: "",
    sectionsJson: "[]",
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSectionsJsonChange = (value: string) => {
    setSchemaFormData({ ...schemaFormData, sectionsJson: value });
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      setShowSuccessMessage(true);
      setEditingTruck(null);
      setEditingSchema(null);
      setTruckFormData({
        truckId: "",
        displayName: "",
        schemaId: "",
      });
      setSchemaFormData({ title: "", sectionsJson: "[]" });
      setTimeout(() => setShowSuccessMessage(false), 3000);
    }
  }, [fetcher.data]);

  const handleEditTruck = (truck: Truck) => {
    setEditingTruck(truck);
    setTruckFormData(truck);
  };

  const handleEditSchema = (schema: TruckCheckSchema) => {
    setEditingSchema(schema);
    setSchemaFormData({
      title: schema.title,
      sectionsJson: JSON.stringify(schema.sections, null, 2),
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Manage Truck Checks</h1>
        <p className="mt-2 opacity-70">
          Create and manage trucks and their check schemas
        </p>
      </div>

      {showSuccessMessage && (
        <div className="alert alert-success mb-4">
          <span>Operation completed successfully!</span>
        </div>
      )}

      {fetcher.data && "error" in fetcher.data && (
        <div className="alert alert-error mb-4">
          <IoWarning className="text-xl" />
          <span>{fetcher.data.error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-6 w-fit">
        <button
          onClick={() => setActiveTab("trucks")}
          className={`tab tab-lg gap-2 ${activeTab === "trucks" ? "tab-active" : ""}`}
        >
          Trucks
          <span className="badge badge-sm">{trucks.length}</span>
        </button>
        <button
          onClick={() => setActiveTab("schemas")}
          className={`tab tab-lg gap-2 ${activeTab === "schemas" ? "tab-active" : ""}`}
        >
          Schemas
          <span className="badge badge-sm">{schemas.length}</span>
        </button>
      </div>

      {/* Trucks Tab */}
      {activeTab === "trucks" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Truck Form */}
          <div className="card bg-base-100 rounded-xl shadow-xl">
            <div className="card-body">
              <h2 className="card-title">
                {editingTruck ? "Edit Truck" : "Create New Truck"}
              </h2>
              <fetcher.Form method="post" className="space-y-4">
                <input
                  type="hidden"
                  name="intent"
                  value={editingTruck ? "update-truck" : "create-truck"}
                />

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Truck ID</span>
                  </label>
                  <input
                    type="text"
                    name="truckId"
                    value={truckFormData.truckId}
                    onChange={(e) =>
                      setTruckFormData({
                        ...truckFormData,
                        truckId: e.target.value,
                      })
                    }
                    disabled={!!editingTruck}
                    required
                    className="input input-bordered w-full"
                    placeholder="medic-1"
                  />
                  <label className="label">
                    <span className="label-text-alt opacity-60">
                      Lowercase with hyphens (e.g. medic-1)
                    </span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Display Name</span>
                  </label>
                  <input
                    type="text"
                    name="displayName"
                    value={truckFormData.displayName}
                    onChange={(e) =>
                      setTruckFormData({
                        ...truckFormData,
                        displayName: e.target.value,
                      })
                    }
                    required
                    className="input input-bordered w-full"
                    placeholder="Medic 1"
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Schema</span>
                  </label>
                  <select
                    name="schemaId"
                    value={truckFormData.schemaId}
                    onChange={(e) =>
                      setTruckFormData({
                        ...truckFormData,
                        schemaId: e.target.value,
                      })
                    }
                    required
                    className="select select-bordered w-full"
                  >
                    <option value="">Select a schema...</option>
                    {schemas.map((schema: TruckCheckSchema) => (
                      <option key={schema.schemaId} value={schema.schemaId}>
                        {schema.title} (v{schema.version})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="card-actions justify-end pt-2">
                  {editingTruck && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTruck(null);
                        setTruckFormData({
                          truckId: "",
                          displayName: "",
                          schemaId: "",
                        });
                      }}
                      className="btn btn-ghost"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    className="btn btn-primary"
                  >
                    {fetcher.state !== "idle"
                      ? "Saving..."
                      : editingTruck
                        ? "Update Truck"
                        : "Create Truck"}
                  </button>
                </div>
              </fetcher.Form>
            </div>
          </div>

          {/* Trucks List */}
          <div className="card bg-base-100 rounded-xl shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Existing Trucks</h2>
              {trucks.length === 0 ? (
                <p className="py-8 text-center opacity-60">
                  No trucks created yet
                </p>
              ) : (
                <div className="divide-base-300 divide-y">
                  {trucks.map((truck: Truck) => {
                    const linkedSchema = schemas.find(
                      (s: TruckCheckSchema) => s.schemaId === truck.schemaId,
                    );
                    return (
                      <div
                        key={truck.truckId}
                        className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex-1">
                          <h3 className="font-semibold">{truck.displayName}</h3>
                          <p className="mt-0.5 font-mono text-xs opacity-50">
                            {truck.truckId}
                          </p>
                          <div className="mt-1">
                            {linkedSchema ? (
                              <span className="badge badge-outline badge-sm">
                                {linkedSchema.title} v{linkedSchema.version}
                              </span>
                            ) : (
                              <span className="badge badge-error badge-sm">
                                No schema
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEditTruck(truck)}
                          className="btn btn-sm btn-ghost"
                        >
                          Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schemas Tab */}
      {activeTab === "schemas" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Schema Form */}
          <div className="card bg-base-100 rounded-xl shadow-xl">
            <div className="card-body">
              <h2 className="card-title">
                {editingSchema
                  ? "Update Schema (New Version)"
                  : "Create New Schema"}
              </h2>
              {editingSchema && (
                <p className="text-sm opacity-70">
                  Editing <strong>{editingSchema.title}</strong> &mdash; will
                  create version {editingSchema.version + 1}
                </p>
              )}
              <fetcher.Form method="post" className="space-y-4">
                <input
                  type="hidden"
                  name="intent"
                  value={editingSchema ? "update-schema" : "create-schema"}
                />
                {editingSchema && (
                  <>
                    <input
                      type="hidden"
                      name="schemaId"
                      value={editingSchema.schemaId}
                    />
                    <input
                      type="hidden"
                      name="version"
                      value={editingSchema.version + 1}
                    />
                  </>
                )}
                {!editingSchema && (
                  <input type="hidden" name="version" value="1" />
                )}

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Title</span>
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={schemaFormData.title}
                    onChange={(e) =>
                      setSchemaFormData({
                        ...schemaFormData,
                        title: e.target.value,
                      })
                    }
                    required
                    className="input input-bordered w-full"
                    placeholder="ALS Truck Check"
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">
                      Sections (JSON)
                    </span>
                    {jsonError ? (
                      <span className="label-text-alt text-error">
                        {jsonError}
                      </span>
                    ) : (
                      schemaFormData.sectionsJson.trim().length > 2 && (
                        <span className="label-text-alt text-success">
                          Valid JSON
                        </span>
                      )
                    )}
                  </label>
                  <textarea
                    name="sections"
                    value={schemaFormData.sectionsJson}
                    onChange={(e) => handleSectionsJsonChange(e.target.value)}
                    rows={14}
                    className={`textarea textarea-bordered w-full font-mono text-sm ${
                      jsonError ? "textarea-error" : ""
                    }`}
                    placeholder="[]"
                  />
                  <label className="label">
                    <span className="label-text-alt opacity-60">
                      Each section needs: id, title, fields[]. Each field needs:
                      type, label.
                    </span>
                  </label>
                </div>

                <div className="card-actions justify-end pt-2">
                  {editingSchema && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSchema(null);
                        setSchemaFormData({ title: "", sectionsJson: "[]" });
                        setJsonError(null);
                      }}
                      className="btn btn-ghost"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle" || !!jsonError}
                    className="btn btn-primary"
                  >
                    {fetcher.state !== "idle"
                      ? "Saving..."
                      : editingSchema
                        ? "Create New Version"
                        : "Create Schema"}
                  </button>
                </div>
              </fetcher.Form>
            </div>
          </div>

          {/* Schemas List */}
          <div className="card bg-base-100 rounded-xl shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Existing Schemas</h2>
              {schemas.length === 0 ? (
                <p className="py-8 text-center opacity-60">
                  No schemas created yet
                </p>
              ) : (
                <div className="divide-base-300 divide-y">
                  {schemas.map((schema: TruckCheckSchema) => {
                    const totalFields = schema.sections.reduce(
                      (sum, s) => sum + s.fields.length,
                      0,
                    );
                    return (
                      <div
                        key={schema.schemaId}
                        className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex-1">
                          <h3 className="font-semibold">{schema.title}</h3>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <span className="badge badge-primary badge-sm">
                              v{schema.version}
                            </span>
                            <span className="badge badge-outline badge-sm">
                              {schema.sections.length} section
                              {schema.sections.length !== 1 ? "s" : ""}
                            </span>
                            <span className="badge badge-outline badge-sm">
                              {totalFields} field
                              {totalFields !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="mt-1 text-xs opacity-50">
                            {new Date(schema.createdAt).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleEditSchema(schema)}
                          className="btn btn-sm btn-ghost"
                        >
                          New Version
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
