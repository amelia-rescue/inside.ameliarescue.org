import type { Route } from "../+types/root";

const requestLogger: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  const start = performance.now();
  let response: Response;

  try {
    response = await next();
    return response;
  } catch (error) {
    let response = Response.json(
      { message: "internal server error" },
      { status: 500 },
    );
    if (error instanceof Response) {
      if (error.status <= 500) {
        response = error;
      }
    }
    console.log(
      JSON.stringify({
        status: response.status,
        time: performance.now() - start,
        method: request.method,
        url: request.url,
      }),
    );
    return response;
  }
};

export { requestLogger };
