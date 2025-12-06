import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { apiFunction } from './functions/api-function/resource';
import { Stack } from 'aws-cdk-lib';
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import {
  HttpLambdaIntegration,
} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  apiFunction,
});

// DynamoDBアクセス権限を追加
const apiFunctionLambda = backend.apiFunction.resources.lambda;
apiFunctionLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:Query',
      'dynamodb:GetItem',
    ],
    resources: [
      `arn:aws:dynamodb:*:*:table/waste_disposal_history`,
    ],
  })
);

const apiStack = backend.createStack('api-stack');

const httpApi = new HttpApi(apiStack, 'HttpApi', {
  apiName: 'myHttpApi',
  corsPreflight: {
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.PUT,
      CorsHttpMethod.DELETE,
    ],
    allowOrigins: ['*'],
    allowHeaders: ['*'],
  },
});

httpApi.addRoutes({
  path: '/data',
  methods: [HttpMethod.GET],
  integration: new HttpLambdaIntegration(
    'ApiFunctionIntegration',
    apiFunctionLambda
  ),
});

backend.addOutput({
  custom: {
    API: {
      [httpApi.httpApiName!]: {
        endpoint: httpApi.url,
        region: Stack.of(httpApi).region,
        apiName: httpApi.httpApiName,
      },
    },
  },
});