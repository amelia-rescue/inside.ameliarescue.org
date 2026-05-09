#!/usr/bin/env node
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { CdkStack } from "./cdk-stack.js";
import { DnsStack } from "./dns-stack.js";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Whenever there is an alarm we sent a notification to this email
const alarmEmail = process.env.ALARM_EMAIL;

if (!alarmEmail) {
  throw new Error("ALARM_EMAIL environment variable is required");
}

const dnsStack = new DnsStack(app, "InsideAmeliaRescueDnsStack", { env });

const appStack = new CdkStack(app, "InsideAmeliaRescueStack", {
  env,
  appDomainName: dnsStack.appDomainName,
  authDomainName: dnsStack.authDomainName,
  hostedZone: dnsStack.hostedZone,
  appCertificate: dnsStack.appCertificate,
  authCertificate: dnsStack.authCertificate,
  alarmEmail,
});

appStack.addDependency(dnsStack);
