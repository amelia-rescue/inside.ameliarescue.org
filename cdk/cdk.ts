#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CdkStack } from "./cdk-stack.js";
import { DnsStack } from "./dns-stack.js";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const dnsStack = new DnsStack(app, "InsideAmeliaRescueDnsStack", { env });

const appStack = new CdkStack(app, "InsideAmeliaRescueStack", {
  env,
  appDomainName: dnsStack.appDomainName,
  authDomainName: dnsStack.authDomainName,
  hostedZone: dnsStack.hostedZone,
  appCertificate: dnsStack.appCertificate,
  authCertificate: dnsStack.authCertificate,
});

appStack.addDependency(dnsStack);
