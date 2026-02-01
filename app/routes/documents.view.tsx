import { redirect, type LoaderFunctionArgs, useLoaderData } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const name = url.searchParams.get("name");

  if (!key) {
    throw redirect("/documents");
  }

  if (
    !key.startsWith("files/documents/") ||
    !key.toLowerCase().endsWith(".pdf")
  ) {
    throw redirect("/documents");
  }

  const pdfUrl = `https://inside.ameliarescue.org/${key}`;

  return {
    pdfUrl,
    name: name || key.split("/").pop() || "Document",
  };
}

export default function DocumentView() {
  const { pdfUrl, name } = useLoaderData() as {
    pdfUrl: string;
    name: string;
  };

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h1 className="card-title text-2xl">{name}</h1>

        <div className="divider" />

        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Open in New Tab
            </a>
          </div>

          <div className="w-full" style={{ height: "calc(100vh - 300px)" }}>
            <iframe
              src={pdfUrl}
              className="border-base-300 h-full w-full rounded-lg border-2"
              title={name}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
