// Opens the AWS console in the browser, signed in with an AWS CLI profile's
// IAM user keys, via the console federation endpoint:
// https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_enable-console-custom-url.html
//
// Usage: tsx scripts/open-console.ts [profile] (default: aes)
import { execFileSync, spawn } from "node:child_process";

const profile = process.argv[2] ?? "aes";
const region = "us-east-2";
const sessionHours = 12;

// A federated session gets the intersection of this policy and the IAM user's
// own permissions, so allowing everything here grants exactly what the user has.
const policy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
});

const credentials = JSON.parse(
  execFileSync(
    "aws",
    [
      "sts",
      "get-federation-token",
      "--name",
      "console",
      "--policy",
      policy,
      "--duration-seconds",
      String(sessionHours * 60 * 60),
      "--profile",
      profile,
      "--query",
      "Credentials",
      "--output",
      "json",
    ],
    { encoding: "utf8" },
  ),
);

const session = JSON.stringify({
  sessionId: credentials.AccessKeyId,
  sessionKey: credentials.SecretAccessKey,
  sessionToken: credentials.SessionToken,
});
const tokenResponse = await fetch(
  `https://signin.aws.amazon.com/federation?Action=getSigninToken&Session=${encodeURIComponent(session)}`,
);
if (!tokenResponse.ok) {
  throw new Error(`Console sign-in failed: HTTP ${tokenResponse.status}`);
}
const { SigninToken } = (await tokenResponse.json()) as { SigninToken: string };

const destination = `https://${region}.console.aws.amazon.com/console/home?region=${region}`;
const loginUrl =
  "https://signin.aws.amazon.com/federation?Action=login" +
  `&Issuer=${encodeURIComponent("inside.ameliarescue.org")}` +
  `&Destination=${encodeURIComponent(destination)}` +
  `&SigninToken=${encodeURIComponent(SigninToken)}`;

// The login URL is a credential for ~15 minutes, so hand it straight to the
// browser instead of printing it.
const [command, args] =
  process.platform === "win32"
    ? ["rundll32", ["url.dll,FileProtocolHandler", loginUrl]]
    : process.platform === "darwin"
      ? ["open", [loginUrl]]
      : ["xdg-open", [loginUrl]];
spawn(command, args, { stdio: "ignore", detached: true }).unref();
console.log(`Opening the AWS console (${profile}, ${sessionHours}h session)…`);
