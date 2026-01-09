import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("./routes/_index.tsx"),
  route("welcome", "./routes/welcome.tsx"),
  route("protected", "./routes/protected.tsx"),
  route("account/security", "./routes/account.security.tsx"),
  route("roster", "./routes/roster.tsx"),
  route("training-status", "./routes/training-status.tsx"),
  route("protocols", "./routes/protocols.tsx"),
  route("constitution", "./routes/constitution.tsx"),
  route("sops", "./routes/sops.tsx"),
  route("truck-check", "./routes/truck-check.tsx"),
  route("profile", "./routes/profile.tsx"),
  ...prefix("auth", [
    route("login", "./routes/auth/login.tsx"),
    route("logout", "./routes/auth/logout.tsx"),
    route("callback", "./routes/auth/callback.tsx"),
    route("passkeys/add", "./routes/auth/passkeys.add.tsx"),
  ]),
  route("test", "./routes/test.tsx"),
] satisfies RouteConfig;
