#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from './cdk-stack.js';

const app = new cdk.App();
new CdkStack(app, 'InsideAmeliaRescueStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
