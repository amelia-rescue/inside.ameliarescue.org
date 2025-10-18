import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/test", "routes/test.tsx"),
  route("/protected", "routes/protected.tsx"),
  route("/auth/login", "routes/auth.login.tsx"),
  route("/auth/callback", "routes/auth.callback.tsx"),
  route("/auth/logout", "routes/auth.logout.tsx"),
] satisfies RouteConfig;
