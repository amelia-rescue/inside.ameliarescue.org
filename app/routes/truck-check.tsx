import { FiExternalLink } from "react-icons/fi";
import { Link } from "react-router";

export default function TruckCheck() {
  return (
    <div className="bg-base-200 min-h-screen">
      <div className="navbar bg-base-100 shadow">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-xl font-semibold">Truck check</div>
            <Link to="/" className="btn btn-sm btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <a
          className="link inline-flex items-center gap-2"
          href="https://docs.google.com/spreadsheets/d/1UoMQ8duLoCRcgHHra400CMHgpUZm0FC4_MAjKRRfMXM/edit?usp=sharing"
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Sheets
          <FiExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
        <div className="w-full">
          <iframe
            className="mt-4 block h-[75vh] min-h-[600px] w-full"
            src="https://docs.google.com/spreadsheets/d/e/2PACX-1vTbDFaICpwOzsv1dm_ZXGl1rdVFrv_XqhOG26CFBzI896RQ_yIA645OiTS01jGZSY44zBpSkIEkTeU6/pubhtml?gid=1391293889&amp;single=true&amp;widget=true&amp;headers=false"
            title="Truck check spreadsheet"
          />
        </div>
      </main>
    </div>
  );
}
