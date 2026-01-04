import { redirect, type LoaderFunctionArgs } from "react-router";
import { getPasskeyAddUrl } from "~/lib/auth.server";
import { requireUser, setSessionData } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const loginData = await getPasskeyAddUrl(request);
  const { url: passkeyAddUrl, codeVerifier } = loginData;

  const sessionHeaders = await setSessionData(request, {
    codeVerifier,
    redirectTo: "/account/security",
  });

  return redirect(passkeyAddUrl, sessionHeaders);
}
