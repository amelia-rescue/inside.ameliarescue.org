import { Link } from "react-router";

export async function loader() {
  throw new Error("fuck");
  return {};
}

export default function SOPs() {
  return (
    <>
      <div className="alert">
        <span>This page is a placeholder.</span>
      </div>
    </>
  );
}
