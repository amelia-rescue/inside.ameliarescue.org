import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { createRequestHandler } from "@react-router/architect";
// @ts-expect-error - Build artifact generated at build time
import * as build from "../build/server/index.js";

const requestHandler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV,
});

// @react-router/architect builds request.url from requestContext.domainName,
// which is the API Gateway hostname rather than the CloudFront domain users
// actually hit. React Router's CSRF check compares that origin against the
// browser's Origin header on every action, so rewrite it to the public host.
const publicHost = process.env.APP_URL
  ? new URL(process.env.APP_URL).host
  : undefined;

// Node 24 on Lambda rejects 3-arity (callback-style) handlers, so this must
// stay a 2-arg async function even though the architect types expect 3.
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> =>
  (await requestHandler(
    publicHost
      ? {
          ...event,
          requestContext: { ...event.requestContext, domainName: publicHost },
        }
      : event,
    context,
    () => {},
  )) as APIGatewayProxyResultV2;
