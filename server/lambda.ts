import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createRequestHandler } from "@react-router/architect";
// @ts-expect-error - Build artifact generated at build time
import * as build from "../build/server/index.js";

export const handler: APIGatewayProxyHandlerV2 = createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});
