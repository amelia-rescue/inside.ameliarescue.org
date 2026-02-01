import { redirect, type LoaderFunctionArgs } from "react-router";
import { getLoginUrl, getPasskeyAddUrl } from "~/lib/auth.server";
import { requireUser, setSessionData } from "~/lib/session.server";

/**
 * Ok so you need a valid cognito session to add a passkey.
 * That session is different that access token or refresh token validity.
 * My work around is to send the user to login first "/auth/passkeys/add?initiate=true"
 * They'll log in there (if needed) and then come back to "/auth/passkeys/add?complete=true"
 * And eventually land on the account security page
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const query = new URL(request.url).searchParams;
  const initiatePasskeyAdd = query.get("initiate");

  if (initiatePasskeyAdd) {
    const { url, codeVerifier } = await getLoginUrl(request);
    const sessionHeaders = await setSessionData(request, {
      codeVerifier,
      redirectTo: "/auth/passkeys/add?complete=true",
    });
    return redirect(url, sessionHeaders);
  }

  const loginData = await getPasskeyAddUrl(request);
  const { url: passkeyAddUrl, codeVerifier } = loginData;

  const sessionHeaders = await setSessionData(request, {
    codeVerifier,
    redirectTo: "/account/security",
  });

  return redirect(passkeyAddUrl, sessionHeaders);
}
