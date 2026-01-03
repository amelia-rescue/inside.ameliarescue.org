import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
          // Production callback URL needs to be added manually after deployment
          // Format: https://CLOUDFRONT_DOMAIN/auth/callback
        ],
        logoutUrls: [
          "http://localhost:5173",
          // Production logout URL needs to be added manually after deployment
        ],
      },
      generateSecret: false, // Public client for web apps
      preventUserExistenceErrors: true,
    });

    // Create Cognito Domain for hosted UI
    const userPoolDomain = userPool.addDomain("UserPoolDomain", {
      cognitoDomain: {
        domainPrefix: `inside-amelia-rescue-${cdk.Stack.of(this).account}`,
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
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(15),
        architecture: cdk.aws_lambda.Architecture.ARM_64,
        logGroup,
        bundling: {
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
          COGNITO_DOMAIN: userPoolDomain.domainName,
          SESSION_SECRET: `session-secret-${cdk.Stack.of(this).account}`,
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
      value: `https://${userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
    });

    new cdk.CfnOutput(this, "ProductionCallbackUrl", {
      description: "Add this URL to Cognito User Pool Client callback URLs",
      value: `https://${distribution.domainName}/auth/callback`,
    });

    new cdk.CfnOutput(this, "ProductionLogoutUrl", {
      description: "Add this URL to Cognito User Pool Client logout URLs",
      value: `https://${distribution.domainName}/`,
    });
  }
}
