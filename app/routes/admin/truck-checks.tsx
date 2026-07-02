import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/truck-checks";
import { appContext } from "~/context";
import {
  TruckCheckSchemaStore,
  type Truck,
  type TruckCheckSchema,
} from "~/lib/truck-check/truck-check-schema-store";
import { IoGitCompare, IoWarning } from "react-icons/io5";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { DateDisplay } from "~/components/date-display";
import { createTwoFilesPatch } from "diff";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  hasError: boolean;
};

function JsonEditor({ value, onChange, hasError }: JsonEditorProps) {
  const [CodeMirrorEditor, setCodeMirrorEditor] =
    useState<ComponentType<any> | null>(null);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [theme, setTheme] = useState<any>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/lang-json"),
      import("@codemirror/theme-one-dark"),
      import("@codemirror/lint"),
    ]).then(([codeMirrorModule, jsonModule, themeModule, lintModule]) => {
      if (!isMounted) {
        return;
      }

      setCodeMirrorEditor(() => codeMirrorModule.default);
      setExtensions([
        jsonModule.json(),
        lintModule.linter(jsonModule.jsonParseLinter()),
        lintModule.lintGutter(),
      ]);
      setTheme(themeModule.oneDark);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        hasError ? "border-error" : "border-base-300"
      } ${
        isFullscreen
          ? "bg-base-100 fixed inset-4 z-50 flex flex-col shadow-2xl"
          : ""
      }`}
    >
      <div className="bg-base-200 border-base-300 flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">JSON Editor</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? "Exit Full Screen" : "Full Screen"}
        </button>
      </div>
      {CodeMirrorEditor ? (
        <CodeMirrorEditor
          value={value}
          height={isFullscreen ? "calc(100vh - 8.5rem)" : "420px"}
          extensions={extensions}
          theme={theme}
          basicSetup={{
            bracketMatching: true,
            closeBrackets: true,
            codeFolding: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            lineNumbers: true,
          }}
          onChange={onChange}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          className="textarea w-full flex-1 rounded-none border-0 font-mono text-sm"
          placeholder="[]"
        />
      )}
    </div>
  );
}

type DiffViewerProps = {
  value: string;
};

function DiffViewer({ value }: DiffViewerProps) {
  const [CodeMirrorEditor, setCodeMirrorEditor] =
    useState<ComponentType<any> | null>(null);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [theme, setTheme] = useState<any>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/theme-one-dark"),
      import("@codemirror/view"),
      import("@codemirror/state"),
    ]).then(([codeMirrorModule, themeModule, viewModule, stateModule]) => {
      if (!isMounted) {
        return;
      }

      const { EditorView, Decoration, ViewPlugin } = viewModule;
      const { RangeSetBuilder } = stateModule;

      const addedLine = Decoration.line({ class: "cm-diff-added" });
      const removedLine = Decoration.line({ class: "cm-diff-removed" });
      const hunkLine = Decoration.line({ class: "cm-diff-hunk" });
      const headerLine = Decoration.line({ class: "cm-diff-header" });

      function buildDiffDecorations(view: any) {
        const builder = new RangeSetBuilder<any>();
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            const text = line.text;
            if (
              text.startsWith("+++") ||
              text.startsWith("---") ||
              text.startsWith("===") ||
              text.startsWith("Index:")
            ) {
              builder.add(line.from, line.from, headerLine);
            } else if (text.startsWith("@@")) {
              builder.add(line.from, line.from, hunkLine);
            } else if (text.startsWith("+")) {
              builder.add(line.from, line.from, addedLine);
            } else if (text.startsWith("-")) {
              builder.add(line.from, line.from, removedLine);
            }
            pos = line.to + 1;
          }
        }
        return builder.finish();
      }

      const diffHighlightPlugin = ViewPlugin.fromClass(
        class {
          decorations: any;

          constructor(view: any) {
            this.decorations = buildDiffDecorations(view);
          }

          update(update: any) {
            if (update.docChanged || update.viewportChanged) {
              this.decorations = buildDiffDecorations(update.view);
            }
          }
        },
        {
          decorations: (v: any) => v.decorations,
        },
      );

      const diffTheme = EditorView.baseTheme({
        ".cm-diff-added": {
          backgroundColor: "rgba(46, 160, 67, 0.25)",
        },
        ".cm-diff-removed": {
          backgroundColor: "rgba(248, 81, 73, 0.25)",
        },
        ".cm-diff-hunk": {
          backgroundColor: "rgba(56, 139, 253, 0.15)",
          color: "#79c0ff",
        },
        ".cm-diff-header": {
          color: "#8b949e",
          fontWeight: "bold",
        },
      });

      setCodeMirrorEditor(() => codeMirrorModule.default);
      setExtensions([EditorView.lineWrapping, diffHighlightPlugin, diffTheme]);
      setTheme(themeModule.oneDark);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      className={`border-base-300 overflow-hidden rounded-lg border ${
        isFullscreen
          ? "bg-base-100 fixed inset-4 z-50 flex flex-col shadow-2xl"
          : ""
      }`}
    >
      <div className="bg-base-200 border-base-300 flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Diff</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? "Exit Full Screen" : "Full Screen"}
        </button>
      </div>
      {CodeMirrorEditor ? (
        <CodeMirrorEditor
          value={value}
          height={isFullscreen ? "calc(100vh - 8.5rem)" : "420px"}
          extensions={extensions}
          theme={theme}
          editable={false}
          readOnly={true}
          basicSetup={{
            codeFolding: true,
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            lineNumbers: true,
          }}
        />
      ) : (
        <pre
          className="textarea w-full flex-1 rounded-none border-0 font-mono text-sm"
          style={{ minHeight: "420px" }}
        >
          {value}
        </pre>
      )}
    </div>
  );
}

type HistoryModalProps = {
  schema: TruckCheckSchema;
  allVersions: TruckCheckSchema[];
};

function HistoryModal({ schema, allVersions }: HistoryModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const versions = useMemo(() => {
    return allVersions
      .filter((s) => s.schemaId === schema.schemaId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [allVersions, schema.schemaId]);

  const current = versions[selectedIndex];
  const previous = versions[selectedIndex + 1];

  const diffText = useMemo(() => {
    if (!current || !previous) {
      return "";
    }

    const oldText =
      JSON.stringify(
        {
          title: previous.title,
          version: previous.version,
          sections: previous.sections,
        },
        null,
        2,
      ) + "\n";
    const newText =
      JSON.stringify(
        {
          title: current.title,
          version: current.version,
          sections: current.sections,
        },
        null,
        2,
      ) + "\n";

    return createTwoFilesPatch(
      `v${previous.version}`,
      `v${current.version}`,
      oldText,
      newText,
      previous.createdAt,
      current.createdAt,
    );
  }, [current, previous]);

  function open() {
    setSelectedIndex(0);
    ref.current?.showModal();
  }

  return (
    <>
      <button type="button" onClick={open} className="btn btn-sm btn-ghost">
        <IoGitCompare className="mr-1" />
        History
      </button>
      <dialog ref={ref} className="modal">
        <div className="modal-box w-11/12 max-w-5xl">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2">
              ✕
            </button>
          </form>
          <h3 className="text-lg font-bold">History: {schema.title}</h3>
          <p className="mb-2 text-sm opacity-70">
            {versions.length} version{versions.length !== 1 ? "s" : ""} saved
          </p>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm">
              {current && previous ? (
                <span>
                  Comparing v{current.version} (
                  <DateDisplay
                    value={current.createdAt}
                    format="shortDateTime"
                  />
                  ) to v{previous.version} (
                  <DateDisplay
                    value={previous.createdAt}
                    format="shortDateTime"
                  />
                  )
                </span>
              ) : (
                <span>No previous version to compare</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
              >
                ← Newer
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={selectedIndex >= versions.length - 2}
                onClick={() =>
                  setSelectedIndex((i) => Math.min(versions.length - 2, i + 1))
                }
              >
                Older →
              </button>
            </div>
          </div>
          {current && previous ? (
            <DiffViewer value={diffText} />
          ) : (
            <div className="border-base-300 bg-base-200 rounded-lg border p-8 text-center text-sm opacity-70">
              Only one version exists. Create a new version to see a diff.
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

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

  return {
    ...c,
    trucks,
    schemas: Object.values(uniqueSchemas),
    allSchemas: schemas,
  };
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
  const { trucks, schemas, allSchemas } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [activeTab, setActiveTab] = useState<"trucks" | "schemas">("schemas");

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
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>Truck Checks</li>
        </ul>
      </div>

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
        <div className="grid grid-cols-1 gap-8">
          <div className="alert order-0">
            <div>
              <h2 className="font-semibold">Truck setup</h2>
              <p className="text-sm">
                Define the different vehicles that need truck checks here.
                Different trucks can have different schemas which allows you to
                customize the checklist for each one.
              </p>
            </div>
          </div>

          {/* Truck Form */}
          <div className="card bg-base-100 order-2 rounded-xl shadow-xl">
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
          <div className="card bg-base-100 order-1 rounded-xl shadow-xl">
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
        <div className="grid grid-cols-1 gap-8">
          <div className="alert order-0">
            <div>
              <h2 className="font-semibold">Schema setup</h2>
              <div className="space-y-2 text-sm">
                <p>
                  Schemas define the sections and fields used for truck checks.
                  Edit the JSON array below to add sections and checklist
                  fields. Updating an existing schema creates a new version.
                </p>
                <p>
                  Each section needs <code>id</code>, <code>title</code>, and a{" "}
                  <code>fields</code> array. Every field needs
                  <code>type</code> and <code>label</code>, and can also include{" "}
                  <code>required</code> and <code>helpText</code>.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <code>checkbox</code>: yes/no checklist item, with optional{" "}
                    <code>defaultValue</code>.
                  </li>
                  <li>
                    <code>text</code>: free-text notes, with optional{" "}
                    <code>placeholder</code> and <code>maxLength</code>.
                  </li>
                  <li>
                    <code>number</code>: numeric entry, with optional{" "}
                    <code>min</code>, <code>max</code>, and <code>unit</code>.
                  </li>
                  <li>
                    <code>select</code>: dropdown choice, with an{" "}
                    <code>options</code> array of <code>value</code>/
                    <code>label</code> pairs.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Schema Form */}
          <div className="card bg-base-100 order-2 rounded-xl shadow-xl">
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
                  <input
                    type="hidden"
                    name="sections"
                    value={schemaFormData.sectionsJson}
                  />
                  <JsonEditor
                    value={schemaFormData.sectionsJson}
                    onChange={handleSectionsJsonChange}
                    hasError={!!jsonError}
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
          <div className="card bg-base-100 order-1 rounded-xl shadow-xl">
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
                            <DateDisplay
                              value={schema.createdAt}
                              format="mediumDate"
                            />
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <HistoryModal
                            schema={schema}
                            allVersions={allSchemas}
                          />
                          <button
                            onClick={() => handleEditSchema(schema)}
                            className="btn btn-sm btn-ghost"
                          >
                            New Version
                          </button>
                        </div>
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
