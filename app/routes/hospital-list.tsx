export default function HospitalList() {
  const pdfUrl =
    "https://inside.ameliarescue.org/files/static/hospital-list.pdf";

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h1 className="card-title text-2xl">Hospital List</h1>
        <p className="text-sm opacity-70">
          Regional hospital contact information
        </p>

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
              title="Hospital List Document"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
