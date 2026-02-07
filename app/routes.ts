import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("./routes/_index.tsx"),
  route("admin", "./routes/admin.tsx"),
  ...prefix("admin", [
    route("create-user", "./routes/admin/create-user.tsx"),
    route("certification-type", "./routes/admin/certification-type.tsx"),
    route("roles", "./routes/admin/roles.tsx"),
    route("tracks", "./routes/admin/tracks.tsx"),
    route("update-user/:user_id", "./routes/admin/update-user.tsx"),
    route("truck-checks", "./routes/admin/truck-checks.tsx"),
  ]),
  route("account/security", "./routes/security.tsx"),
  route("roster", "./routes/roster.tsx"),
  route("training-status", "./routes/training-status.tsx"),
  route("realtime-counter", "./routes/realtime-counter.tsx"),
  route("documents", "./routes/documents.tsx"),
  route("documents/view", "./routes/documents.view.tsx"),
  route("truck-check", "./routes/truck-check.tsx"),
  route("truck-checks", "./routes/truck-checks.tsx"),
  route("truck-checks/:id", "./routes/truck-check-dynamic.tsx"),
  route("profile", "./routes/profile.tsx"),
  route("user/:user_id", "./routes/user.$user_id.tsx"),
  ...prefix("auth", [
    route("login", "./routes/auth/login.tsx"),
    route("logout", "./routes/auth/logout.tsx"),
    route("logout-complete", "./routes/auth/logout-complete.tsx"),
    route("callback", "./routes/auth/callback.tsx"),
    route("passkeys/add", "./routes/auth/passkeys.add.tsx"),
  ]),
  ...prefix("api/documents", [
    route("get-upload-url", "./routes/api/documents.get-upload-url.tsx"),
    route("delete", "./routes/api/documents.delete.tsx"),
  ]),
  ...prefix("api/certifications", [
    route("get-upload-url", "./routes/api/certifications.get-upload-url.tsx"),
    route("save", "./routes/api/certifications.save.tsx"),
  ]),
  ...prefix("api/profile-picture", [
    route("get-upload-url", "./routes/api/profile-picture.get-upload-url.tsx"),
    route("save", "./routes/api/profile-picture.save.tsx"),
  ]),
  route("*", "./routes/$.tsx"),
] satisfies RouteConfig;
