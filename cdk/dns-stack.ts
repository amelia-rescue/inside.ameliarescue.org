import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";

export class DnsStack extends cdk.Stack {
  public readonly appDomainName: string;
  public readonly authDomainName: string;
  public readonly hostedZone: route53.IHostedZone;
  public readonly appCertificate: acm.ICertificate;
  public readonly authCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.appDomainName = "inside.ameliarescue.org";
    this.authDomainName = `auth.${this.appDomainName}`;

    const hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: this.appDomainName,
    });

    const appCertificate = new acm.DnsValidatedCertificate(
      this,
      "AppCertificate",
      {
        domainName: this.appDomainName,
        hostedZone,
        region: "us-east-1",
      },
    );

    const authCertificate = new acm.DnsValidatedCertificate(
      this,
      "AuthCertificate",
      {
        domainName: this.authDomainName,
        hostedZone,
        region: "us-east-1",
      },
    );

    this.hostedZone = hostedZone;
    this.appCertificate = appCertificate;
    this.authCertificate = authCertificate;

    new cdk.CfnOutput(this, "HostedZoneNameServers", {
      value: cdk.Fn.join(",", hostedZone.hostedZoneNameServers ?? []),
    });

    new cdk.CfnOutput(this, "HostedZoneId", {
      value: hostedZone.hostedZoneId,
    });

    new cdk.CfnOutput(this, "AppDomainName", {
      value: this.appDomainName,
    });

    new cdk.CfnOutput(this, "AuthDomainName", {
      value: this.authDomainName,
    });

    new cdk.CfnOutput(this, "CloudFrontCertificateArn", {
      value: appCertificate.certificateArn,
    });

    new cdk.CfnOutput(this, "CognitoCertificateArn", {
      value: authCertificate.certificateArn,
    });
  }
}
