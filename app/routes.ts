import { type RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

const ignoredRouteFiles = ["home.tsx", "**/*.test.ts", "**/*.test.tsx"];

export default flatRoutes({
  ignoredRouteFiles,
}) satisfies RouteConfig;
