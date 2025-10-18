import type { Route } from "../+types/root";

const requestLogger: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  console.log(request.method, request.url);
  return await next();
};

export { requestLogger };
