import { expect, it } from "vitest";
import {
  getLogGroups,
  getQueryWindow,
  parseAlarmNotification,
} from "./alarm-triage";

const config = {
  appLogGroup: "/aws/lambda/inside-amelia-rescue",
  accessLogGroup: "/aws/apigateway/inside-amelia-rescue-api/access-logs",
};

const apiAlarmMessage = JSON.stringify({
  AlarmName: "inside-amelia-rescue-http-api-5xx-errors",
  AlarmDescription: "5xx alarm",
  NewStateValue: "ALARM",
  NewStateReason: "Threshold Crossed",
  StateChangeTime: "2026-10-20T12:05:31.123+0000",
  Trigger: {
    MetricName: "5xx",
    Namespace: "AWS/ApiGateway",
    Dimensions: [{ name: "ApiId", value: "abc123" }],
    Period: 300,
    EvaluationPeriods: 1,
  },
});

it("parses a CloudWatch alarm notification", () => {
  const alarm = parseAlarmNotification(apiAlarmMessage)!;
  expect(alarm.alarmName).toBe("inside-amelia-rescue-http-api-5xx-errors");
  expect(alarm.newState).toBe("ALARM");
  expect(alarm.stateChangeTime.toISOString()).toBe("2026-10-20T12:05:31.123Z");
  expect(alarm.dimensions).toEqual({ ApiId: "abc123" });
});

it("ignores messages that aren't alarm notifications", () => {
  expect(parseAlarmNotification("not json")).toBeUndefined();
  expect(
    parseAlarmNotification(JSON.stringify({ requestContext: {} })),
  ).toBeUndefined();
});

it("looks back over the evaluation periods plus ten minutes", () => {
  const { start, end } = getQueryWindow(
    parseAlarmNotification(apiAlarmMessage)!,
  );
  expect(start.toISOString()).toBe("2026-10-20T11:50:31.123Z");
  expect(end.toISOString()).toBe("2026-10-20T12:07:31.123Z");
});

it("queries the app and access logs for API Gateway alarms", () => {
  expect(
    getLogGroups(parseAlarmNotification(apiAlarmMessage)!, config),
  ).toEqual({
    functionLogGroups: [config.appLogGroup],
    accessLogGroup: config.accessLogGroup,
  });
});

it("queries the alarmed function's logs for Lambda alarms", () => {
  const alarm = parseAlarmNotification(
    JSON.stringify({
      ...JSON.parse(apiAlarmMessage),
      Trigger: {
        Namespace: "AWS/Lambda",
        Dimensions: [
          { name: "FunctionName", value: "inside-amelia-rescue-websocket" },
        ],
      },
    }),
  )!;
  expect(getLogGroups(alarm, config)).toEqual({
    functionLogGroups: ["/aws/lambda/inside-amelia-rescue-websocket"],
  });
});
