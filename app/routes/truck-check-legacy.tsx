import { FiExternalLink } from "react-icons/fi";
import { HiOutlineChevronLeft } from "react-icons/hi2";

export default function TruckCheckLegacy() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <a
          href="/truck-check"
          className="link link-hover inline-flex items-center gap-1 text-sm opacity-70"
        >
          <HiOutlineChevronLeft className="h-4 w-4" />
          Back to Truck Checks
        </a>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Legacy Truck Check</h1>
        </div>
        <a
          className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
          href="https://docs.google.com/spreadsheets/d/1UoMQ8duLoCRcgHHra400CMHgpUZm0FC4_MAjKRRfMXM/edit?usp=sharing"
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Sheets
          <FiExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </div>
      <div className="w-full">
        <iframe
          className="block h-[75vh] min-h-[600px] w-full rounded-xl border"
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vTbDFaICpwOzsv1dm_ZXGl1rdVFrv_XqhOG26CFBzI896RQ_yIA645OiTS01jGZSY44zBpSkIEkTeU6/pubhtml?gid=1391293889&amp;single=true&amp;widget=true&amp;headers=false"
          title="Truck check spreadsheet"
        />
      </div>
    </div>
  );
}
