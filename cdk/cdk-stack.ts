import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as logs from "aws-cdk-lib/aws-logs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
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

    const usersTable = new dynamodb.Table(this, "UsersTable", {
      tableName: "aes_users",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const certificationTypesTable = new dynamodb.Table(
      this,
      "CertificationTypesTable",
      {
        tableName: "aes_certification_types",
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        partitionKey: {
          name: "name",
          type: dynamodb.AttributeType.STRING,
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    const userCertificationsTable = new dynamodb.Table(
      this,
      "UserCertificationsTable",
      {
        tableName: "aes_user_certifications",
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        partitionKey: {
          name: "certification_id",
          type: dynamodb.AttributeType.STRING,
        },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    userCertificationsTable.addGlobalSecondaryIndex({
      indexName: "UserIdIndex",
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "uploaded_at", type: dynamodb.AttributeType.STRING },
    });

    const rolesTable = new dynamodb.Table(this, "RolesTable", {
      tableName: "aes_roles",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "name",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const tracksTable = new dynamodb.Table(this, "TracksTable", {
      tableName: "aes_tracks",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "name",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create S3 bucket for file uploads
    const fileUploadsBucket = new s3.Bucket(this, "FileUploadsBucket", {
      enforceSSL: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

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
          FILE_CDN_URL: `https://${appDomainName}`,
          USERS_TABLE_NAME: usersTable.tableName,
          CERTIFICATION_TYPES_TABLE_NAME: certificationTypesTable.tableName,
          USER_CERTIFICATIONS_TABLE_NAME: userCertificationsTable.tableName,
          ROLES_TABLE_NAME: rolesTable.tableName,
          TRACKS_TABLE_NAME: tracksTable.tableName,
          FILE_UPLOADS_BUCKET_NAME: fileUploadsBucket.bucketName,
        },
      },
    );

    usersTable.grantReadWriteData(lambdaFunction);
    certificationTypesTable.grantReadWriteData(lambdaFunction);
    userCertificationsTable.grantReadWriteData(lambdaFunction);
    rolesTable.grantReadWriteData(lambdaFunction);
    tracksTable.grantReadWriteData(lambdaFunction);
    fileUploadsBucket.grantReadWrite(lambdaFunction);

    // Grant Lambda permissions to manage Cognito users
    userPool.grant(
      lambdaFunction,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminDeleteUser",
    );

    // Create API Gateway HTTP API
    // Note: No CORS configuration needed since CloudFront sits in front
    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "inside-amelia-rescue-api",
      description: "API Gateway for React Router Lambda",
    });

    // Create Lambda integration
    const lambdaIntegration =
      new apigatewayv2Integrations.HttpLambdaIntegration(
        "LambdaIntegration",
        lambdaFunction,
      );

    // Add default catch-all route to API Gateway
    // This single route handles all paths and methods
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // Add root path route (/{proxy+} doesn't match root)
    httpApi.addRoutes({
      path: "/",
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: lambdaIntegration,
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
        origin: new origins.HttpOrigin(
          cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint)),
          {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            customHeaders: {
              "X-Forwarded-Host": appDomainName,
            },
          },
        ),
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
        "/files/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            fileUploadsBucket,
            {
              originAccessLevels: [
                cloudfront.AccessLevel.READ,
                cloudfront.AccessLevel.LIST,
              ],
            },
          ),
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
    new cdk.CfnOutput(this, "ApiGatewayEndpoint", {
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "UsersTableName", {
      value: usersTable.tableName,
    });

    new cdk.CfnOutput(this, "CertificationTypesTableName", {
      value: certificationTypesTable.tableName,
    });

    new cdk.CfnOutput(this, "UserCertificationsTableName", {
      value: userCertificationsTable.tableName,
    });

    new cdk.CfnOutput(this, "RolesTableName", {
      value: rolesTable.tableName,
    });

    new cdk.CfnOutput(this, "TracksTableName", {
      value: tracksTable.tableName,
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
