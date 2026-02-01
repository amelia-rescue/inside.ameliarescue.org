// the type in the aws-lambda module sucks so I made my own
export type ApiGatewayWebSocketEvent = {
  headers?: {
    [key: string]: string;
  };
  multiValueHeaders?: {
    [key: string]: string[];
  };
  queryStringParameters?: {
    [key: string]: string;
  } | null;
  multiValueQueryStringParameters?: {
    [key: string]: string[];
  } | null;
  requestContext: {
    routeKey: string;
    eventType: "CONNECT" | "MESSAGE" | "DISCONNECT";
    extendedRequestId: string;
    requestTime: string;
    messageDirection: "IN" | "OUT";
    stage: string;
    connectedAt: number;
    requestTimeEpoch: number;
    identity: {
      userAgent: string;
      sourceIp: string;
    };
    requestId: string;
    domainName: string;
    connectionId: string;
    apiId: string;
  };
  isBase64Encoded: boolean;
};
