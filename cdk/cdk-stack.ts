import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as logs from "aws-cdk-lib/aws-logs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CdkStackProps extends cdk.StackProps {
  appDomainName: string;
  authDomainName: string;
  hostedZone: route53.IHostedZone;
  appCertificate: acm.ICertificate;
  authCertificate: acm.ICertificate;
}

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkStackProps) {
    super(scope, id, props);

    const {
      appDomainName,
      authDomainName,
      hostedZone,
      appCertificate,
      authCertificate,
    } = props;

    // Create Cognito User Pool with Passkey support
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "inside-amelia-rescue-users",
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create User Pool Client with OIDC configuration
    // Note: Callback URLs initially set to localhost only to avoid circular dependency
    // Update the callback URLs in AWS Console after first deployment with CloudFront domain
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      userPoolClientName: "inside-amelia-rescue-client",
      authFlows: {
        userPassword: true,
        userSrp: true,
        user: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:5173/auth/callback",
          `https://${appDomainName}/auth/callback`,
        ],
        logoutUrls: ["http://localhost:5173", `https://${appDomainName}/`],
      },
      generateSecret: false, // Public client for web apps
      preventUserExistenceErrors: true,
    });

    // Create Cognito Domain for hosted UI
    const userPoolDomain = userPool.addDomain("UserPoolDomain", {
      customDomain: {
        domainName: authDomainName,
        certificate: authCertificate,
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const managedLoginBranding = new cognito.CfnManagedLoginBranding(
      this,
      "ManagedLoginBranding",
      {
        userPoolId: userPool.userPoolId,
        clientId: userPoolClient.userPoolClientId,
        useCognitoProvidedValues: true,
      },
    );

    managedLoginBranding.addDependency(
      userPoolDomain.node.defaultChild as cognito.CfnUserPoolDomain,
    );

    // Create CloudWatch log group for Lambda function
    const logGroup = new logs.LogGroup(this, "ReactRouterHandlerLogs", {
      logGroupName: "/aws/lambda/inside-amelia-rescue",
      retention: logs.RetentionDays.SEVEN_YEARS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Set absolute path to the lambda.ts handler
    const entry = path.join(__dirname, "../server/lambda.ts");

    // Create Lambda function for React Router
    const lambdaFunction = new nodejs.NodejsFunction(
      this,
      "ReactRouterHandler",
      {
        functionName: "inside-amelia-rescue",
        runtime: lambda.Runtime.NODEJS_24_X,
        handler: "handler",
        entry,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(15),
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        logGroup,
        bundling: {
          // so react-router/architect wants aws-sdk v2? so stupid
          externalModules: ["@aws-sdk/*", "aws-sdk"],
          minify: true,
          sourceMap: true,
          target: "es2022",
        },
        environment: {
          NODE_ENV: "production",
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_ISSUER: `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
          COGNITO_DOMAIN: authDomainName,
          SESSION_SECRET: `session-secret-${cdk.Stack.of(this).account}`,
          APP_URL: `https://${appDomainName}`,
        },
      },
    );

    // Create Function URL for the Lambda
    const functionUrl = lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // Create S3 bucket for static assets
    const staticBucket = new s3.Bucket(this, "StaticBucket", {
      enforceSSL: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create CloudFront distribution (needs to be created before User Pool Client for callback URLs)
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        "/assets/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(staticBucket, {
            originAccessLevels: [
              cloudfront.AccessLevel.READ,
              cloudfront.AccessLevel.LIST,
            ],
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      domainNames: [appDomainName],
      certificate: appCertificate,
    });

    const appAliasRecord = new route53.ARecord(this, "AppAliasRecord", {
      zone: hostedZone,
      recordName: "",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });

    const appAliasRecordAAAA = new route53.AaaaRecord(
      this,
      "AppAliasRecordAAAA",
      {
        zone: hostedZone,
        recordName: "",
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution),
        ),
      },
    );

    userPoolDomain.node.addDependency(appAliasRecord);
    userPoolDomain.node.addDependency(appAliasRecordAAAA);

    new route53.ARecord(this, "AuthAliasRecord", {
      zone: hostedZone,
      recordName: "auth",
      target: route53.RecordTarget.fromAlias(
        new targets.UserPoolDomainTarget(userPoolDomain),
      ),
    });

    // Deploy static assets to S3
    new s3deploy.BucketDeployment(this, "DeployStaticAssets", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../build/client/assets")),
      ],
      destinationBucket: staticBucket,
      destinationKeyPrefix: "assets",
      distribution,
      distributionPaths: ["/assets/*"],
    });

    // Note: APP_URL is determined at runtime from request headers
    // to avoid circular dependency with CloudFront distribution

    // Outputs
    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "CognitoHostedUIUrl", {
      value: `https://${authDomainName}`,
    });

    new cdk.CfnOutput(this, "ProductionCallbackUrl", {
      description: "Add this URL to Cognito User Pool Client callback URLs",
      value: `https://${appDomainName}/auth/callback`,
    });

    new cdk.CfnOutput(this, "ProductionLogoutUrl", {
      description: "Add this URL to Cognito User Pool Client logout URLs",
      value: `https://${appDomainName}/`,
    });
  }
}
