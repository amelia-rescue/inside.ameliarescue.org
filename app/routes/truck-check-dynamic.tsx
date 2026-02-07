import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamic";
import { useLoaderData } from "react-router";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";

export async function loader({ context, params }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("Context not found");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();

  const truckCheck = await truckCheckStore.getTruckCheck(params.id);
  const truck = await truckCheckSchemaStore.getTruck(truckCheck.truck);
  const schema = await truckCheckSchemaStore.getSchema(truck.schemaId);

  return {
    user: ctx.user,
    truckCheck,
    truck,
    schema,
  };
}

const renderField = (field: any, sectionId: string) => {
  const fieldId = `${sectionId}-${field.label.replace(/\s+/g, "-").toLowerCase()}`;

  switch (field.type) {
    case "checkbox":
      return (
        <div key={fieldId} className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" className="checkbox" />
            <span className="label-text">{field.label}</span>
            {field.required && <span className="text-error">*</span>}
          </label>
          {field.helpText && (
            <span className="label-text-alt ml-9 opacity-60">
              {field.helpText}
            </span>
          )}
        </div>
      );

    case "text":
      return (
        <div key={fieldId} className="form-control">
          <label className="label">
            <span className="label-text">
              {field.label}
              {field.required && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            type="text"
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            className="input input-bordered"
          />
          {field.helpText && (
            <label className="label">
              <span className="label-text-alt opacity-60">
                {field.helpText}
              </span>
            </label>
          )}
        </div>
      );

    case "number":
      return (
        <div key={fieldId} className="form-control">
          <label className="label">
            <span className="label-text">
              {field.label}
              {field.required && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={field.min}
              max={field.max}
              className="input input-bordered flex-1"
            />
            {field.unit && <span className="opacity-60">{field.unit}</span>}
          </div>
          {field.helpText && (
            <label className="label">
              <span className="label-text-alt opacity-60">
                {field.helpText}
              </span>
            </label>
          )}
        </div>
      );

    case "select":
      return (
        <div key={fieldId} className="form-control">
          <label className="label">
            <span className="label-text">
              {field.label}
              {field.required && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <select className="select select-bordered">
            <option value="">Select...</option>
            {field.options?.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.helpText && (
            <label className="label">
              <span className="label-text-alt opacity-60">
                {field.helpText}
              </span>
            </label>
          )}
        </div>
      );

    case "photo":
      return (
        <div key={fieldId} className="form-control">
          <label className="label">
            <span className="label-text">
              {field.label}
              {field.required && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            className="file-input file-input-bordered"
          />
          {field.maxPhotos && (
            <label className="label">
              <span className="label-text-alt opacity-60">
                Max {field.maxPhotos} photos
              </span>
            </label>
          )}
          {field.helpText && (
            <label className="label">
              <span className="label-text-alt opacity-60">
                {field.helpText}
              </span>
            </label>
          )}
        </div>
      );

    default:
      return null;
  }
};

export default function TruckCheckDynamic() {
  const { user, truckCheck, truck, schema } = useLoaderData<typeof loader>();

  console.log(schema);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{schema.title}</h1>
        <p className="mt-2 opacity-70">
          {truck.displayName} -{" "}
          {new Date(truckCheck.created_at).toLocaleDateString()}
        </p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span
            className={`badge ${truckCheck.locked ? "badge-error" : "badge-success"}`}
          >
            {truckCheck.locked ? "Locked" : "Active"}
          </span>
          <span className="opacity-60">
            {truckCheck.contributors.length} contributor
            {truckCheck.contributors.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {schema.sections.map((section: any) => (
          <div key={section.id} className="collapse-arrow bg-base-200 collapse">
            <input type="checkbox" defaultChecked />
            <div className="collapse-title text-xl font-medium">
              {section.title}
              {section.description && (
                <p className="mt-1 text-sm font-normal opacity-70">
                  {section.description}
                </p>
              )}
            </div>
            <div className="collapse-content">
              <div className="space-y-4 pt-4">
                {section.fields.map((field: any) =>
                  renderField(field, section.id),
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end gap-4">
        <button className="btn btn-ghost">Cancel</button>
        <button className="btn btn-primary">Save Progress</button>
      </div>
    </div>
  );
}
