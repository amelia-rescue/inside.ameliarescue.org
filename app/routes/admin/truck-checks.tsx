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

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const store = TruckCheckSchemaStore.make();

  try {
    if (intent === "create-truck") {
      const truck: Truck = {
        truckId: formData.get("truckId") as string,
        displayName: formData.get("displayName") as string,
        schemaId: formData.get("schemaId") as string,
      };
      await store.createTruck(truck);
      return { success: true, intent };
    }

    if (intent === "update-truck") {
      const truck: Truck = {
        truckId: formData.get("truckId") as string,
        displayName: formData.get("displayName") as string,
        schemaId: formData.get("schemaId") as string,
      };
      await store.updateTruck(truck);
      return { success: true, intent };
    }

    if (intent === "create-schema") {
      const sectionsJson = formData.get("sections") as string;
      const sections = sectionsJson ? JSON.parse(sectionsJson) : [];

      await store.createSchema({
        version: parseInt(formData.get("version") as string),
        title: formData.get("title") as string,
        sections,
      });
      return { success: true, intent };
    }

    if (intent === "update-schema") {
      const sectionsJson = formData.get("sections") as string;
      const sections = sectionsJson ? JSON.parse(sectionsJson) : [];

      await store.updateSchema({
        schemaId: formData.get("schemaId") as string,
        version: parseInt(formData.get("version") as string),
        title: formData.get("title") as string,
        sections,
      });
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
        <p className="mt-2 text-gray-600">
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
      <div className="tabs tabs-boxed mb-6">
        <button
          onClick={() => setActiveTab("trucks")}
          className={`tab tab-lg ${activeTab === "trucks" ? "tab-active" : ""}`}
        >
          Trucks ({trucks.length})
        </button>
        <button
          onClick={() => setActiveTab("schemas")}
          className={`tab tab-lg ${activeTab === "schemas" ? "tab-active" : ""}`}
        >
          Schemas ({schemas.length})
        </button>
      </div>

      {/* Trucks Tab */}
      {activeTab === "trucks" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Truck Form */}
          <div className="card bg-base-100 shadow-xl">
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
                    <span className="label-text">Truck ID</span>
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
                    className="input input-bordered"
                    placeholder="medic-1"
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Display Name</span>
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
                    className="input input-bordered"
                    placeholder="Medic 1"
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Schema</span>
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
                    className="select select-bordered"
                  >
                    <option value="">Select a schema...</option>
                    {schemas.map((schema: TruckCheckSchema) => (
                      <option key={schema.schemaId} value={schema.schemaId}>
                        {schema.title} (v{schema.version})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="card-actions justify-end">
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
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Existing Trucks</h2>
              {trucks.length === 0 ? (
                <p className="py-8 text-center opacity-60">
                  No trucks created yet
                </p>
              ) : (
                <div className="space-y-3">
                  {trucks.map((truck: Truck) => (
                    <div key={truck.truckId} className="card bg-base-200">
                      <div className="card-body p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {truck.displayName}
                            </h3>
                            <p className="mt-1 text-sm opacity-70">
                              ID: {truck.truckId}
                            </p>
                            <p className="text-sm opacity-70">
                              Schema:{" "}
                              {schemas.find(
                                (s: TruckCheckSchema) =>
                                  s.schemaId === truck.schemaId,
                              )?.title || "Unknown"}
                            </p>
                          </div>
                          <button
                            onClick={() => handleEditTruck(truck)}
                            className="btn btn-sm btn-ghost"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">
                {editingSchema
                  ? "Update Schema (New Version)"
                  : "Create New Schema"}
              </h2>
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
                    <span className="label-text">Title</span>
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
                    className="input input-bordered"
                    placeholder="ALS Truck Check"
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Sections (JSON)</span>
                  </label>
                  <textarea
                    name="sections"
                    value={schemaFormData.sectionsJson}
                    onChange={(e) =>
                      setSchemaFormData({
                        ...schemaFormData,
                        sectionsJson: e.target.value,
                      })
                    }
                    rows={10}
                    className="textarea textarea-bordered font-mono text-sm"
                    placeholder="[]"
                  />
                  <label className="label">
                    <span className="label-text-alt">
                      Enter schema sections as JSON array
                    </span>
                  </label>
                </div>

                <div className="card-actions justify-end">
                  {editingSchema && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSchema(null);
                        setSchemaFormData({ title: "", sectionsJson: "[]" });
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
                      : editingSchema
                        ? "Create New Version"
                        : "Create Schema"}
                  </button>
                </div>
              </fetcher.Form>
            </div>
          </div>

          {/* Schemas List */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Existing Schemas</h2>
              {schemas.length === 0 ? (
                <p className="py-8 text-center opacity-60">
                  No schemas created yet
                </p>
              ) : (
                <div className="space-y-3">
                  {schemas.map((schema: TruckCheckSchema) => (
                    <div key={schema.schemaId} className="card bg-base-200">
                      <div className="card-body p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{schema.title}</h3>
                            <p className="mt-1 text-sm opacity-70">
                              Version {schema.version}
                            </p>
                            <p className="text-sm opacity-70">
                              {schema.sections.length} section(s)
                            </p>
                            <p className="mt-1 text-xs opacity-60">
                              Created:{" "}
                              {new Date(schema.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleEditSchema(schema)}
                            className="btn btn-sm btn-ghost"
                          >
                            New Version
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
