# ⚡️ Easy Sentry SDK Integration For AWS Lambda

[![nodejs](https://img.shields.io/node/v/serverless-sentry-lib.svg?style=flat-square)](https://nodejs.org/)
[![@sentry/node](https://img.shields.io/npm/dependency-version/serverless-sentry-lib/peer/@sentry/node.svg?style=flat-square)](https://sentry.io/)
[![npm](https://img.shields.io/npm/v/serverless-sentry-lib.svg)](https://www.npmjs.com/package/serverless-sentry-lib)
[![license](https://img.shields.io/github/license/arabold/serverless-sentry-lib.svg)](https://github.com/arabold/serverless-sentry-lib/blob/master/LICENSE)
[![dependencies](https://img.shields.io/librariesio/github/arabold/serverless-sentry-lib.svg)](https://www.npmjs.com/package/serverless-sentry-lib)
[![prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://prettier.io/)

## About

This library simplifies the integration of Sentry's [@sentry/node](https://docs.sentry.io/clients/node/) library with AWS Lambda. The only supported platforms of this library are the [Lambda Runtimes for Node.js 10 and 12](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html). Python and Java support will require dedicated libraries. Pull requests are welcome!

The `serverless-sentry-plugin` and `serverless-sentry-lib` libraries are not affiliated with either Functional Software Inc., Sentry, Serverless or Amazon Web Services but developed independently and in my spare time.

### Benefits

- Easy to use. Promised 🤞
- Integrates with [Serverless Framework](http://www.serverless.com) as well as the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/) for AWS Lambda (though no use of any framework is required).
- Wraps your Node.js code with [Sentry](http://getsentry.com) error capturing.
- Forwards any errors returned by your AWS Lambda function to Sentry.
- Warn if your code is about to hit the execution timeout limit.
- Warn if your Lambda function is low on memory.
- Reports unhandled promise rejections.
- Catches and reports uncaught exceptions.
- Serverless, Sentry and as well as this library are all Open Source. Yay! 🎉
- TypeScript support

## Installation

- Install the `@sentry/node` module:
  ```sh
  npm install --save @sentry/node
  ```
- Install this module:
  ```sh
  npm install --save serverless-sentry-lib
  ```
- Check out the examples below on how to integrate it with your project by updating `serverless.yml` as well as your Lambda handler code.

Although this library is written in TypeScript, the resulting library uses exclusively Node 10 features to ensure this code can run on AWS Lambda without any additional transpiling or further processing. We also do not use _any_ 3rd party node module other than `@sentry/node` itself.

This library can be used standalone or as part of the [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin).

### Use as a Standalone Library

If you don't want to add another plugin to Serverless (or if you're not using the Serverless Framework), you can use this library standalone without additional dependencies (besides `@sentry/node` itself).

If you're using the Serverless Framework, extend your `serverless.yml` to include additional environment variables. The only _required_ environment variable is `SENTRY_DSN`
to set the [DSN URL](https://docs.sentry.io/quickstart/#configure-the-dsn) for your reporting. A full list of all available environment variables is available below.

```yaml
service: my-serverless-project
provider:
  # ...
  environment:
    SENTRY_ENVIRONMENT: ${opt:stage, self:provider.stage} # recommended
    SENTRY_DSN: https://xxxx:yyyy@sentry.io/zzzz # URL provided by Sentry
```

If you are using the [AWS Serverless Application Model](https://aws.amazon.com/serverless/sam/), set the environment variables in your `template.yml`:

```yml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Resources:
  SomeFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: some-function/
      Handler: index.handler
      Runtime: nodejs12.x
      Environment:
        Variables:
          SENTRY_DSN: https://xxxx:yyyy@sentry.io/zzzz
```

### Environment Variables

Capturing can be controlled through the following environment variables. You can set them manually in your `serverless.yml` (Serverless Framework) or `template.yml` (AWS SAM) or let them be configured automatically using the [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin) during deployment.
In addition, the library checks for the following optional variables and adds them as custom Sentry tags automatically:

| Environment Variable | Sentry Tag   | Description                                                                                             |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `SERVERLESS_SERVICE` | service_name | Serveless service name                                                                                  |
| `SERVERLESS_STAGE`   | stage        | Serverless stage                                                                                        |
| `SERVERLESS_ALIAS`   | alias        | Serverless alias, see [Serverless AWS Alias Plugin](https://github.com/hyperbrain/serverless-aws-alias) |
| `SERVERLESS_REGION`  | region       | Serverless region name                                                                                  |

### Use Together With the Serverless Sentry Plugin

The [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin) allows simpler configuration of the library through the `serverless.yml` and will upload your source-maps automatically during deployment. This is the recommended way of using the `serverless-sentry-lib` library.

Instead of manually setting environment variables, the plugin determines and sets them automatically. In the `serverless.yml` simply load the plugin and set the `dsn` configuration option as follows:

```yaml
service: my-serverless-project
provider:
  # ...
plugins: serverless-sentry
custom:
  sentry:
    dsn: https://xxxx:yyyy@sentry.io/zzzz # URL provided by Sentry
```

You can still manually set environment variables on a per-function level to overwrite the default ones. Please refer to the [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin) for full documentation of all available options.

## Updating Your Code

For maximum flexibility, this library is implemented as a wrapper around your original AWS Lambda handler code (your `handler.js` or similar function). The `withSentry` higher-order function adds error and exception handling and takes care of configuring the Sentry client automatically.

`withSentry` is pre-configured to reasonable defaults and doesn't need any configuration. It will automatically load and configure `@sentry/node` which needs to be installed as a peer dependency.

**Original Lambda Handler Code**:

```js
exports.handler = async function (event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
};
```

**New Lambda Handler Code Using `withSentry` For Sentry Reporting**

```js
const withSentry = require("serverless-sentry-lib"); // This helper library

exports.handler = withSentry(async function (event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
});
```

**ES6 Module: Original Lambda Handler Code**:

```ts
export async function handler(event, context) {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
}
```

**ES6 Module: New Lambda Handler Code Using `withSentry` For Sentry Reporting**

```ts
import withSentry from "serverless-sentry-lib"; // This helper library

export const handler = withSentry(async (event, context) => {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
});
```

Once your Lambda handler code is wrapped in `withSentry`, it will be extended it with automatic error reporting. Whenever your Lambda handler sets an error response, the error is forwarded to Sentry with additional context information.

### Setting Custom Configuration Options

As shown above you can use environment variables to control the Sentry integration. In some scenarios in which environment variables are not desired or in which custom logic needs to be executed, you can also pass in configuration options to `withSentry` directly:

You can control how Sentry should be initialized by passing the following options:

- `sentryOptions` - Additional options to set for the Sentry client, e.g. proxy settings.
- `scope` - Custom scope settings.
- `filterLocal` - don't report errors from local environments (defaults to `true`).
- `sourceMaps` - Enable source maps (defaults to `false`) by loading the `RewriteFrames` Sentry integration.

Or, alternatively, you can pass in a custom, already preconfigured Sentry object. Note that Sentry _needs_ to be properly initialized in this case:

- `sentry` - Use the given Sentry instance instead of importing it automatically.

In addition, you can set any of the following options to control what events should be captured:

- `flushTimeout` - How long we should wait for Sentry data to be written when shutting down the Lambda or between invocations (defaults to `2000` milliseconds).
- `autoBreadcrumbs` - Automatically create breadcrumbs (see Sentry SDK docs, defaults to `true`).
- `captureErrors` - capture Lambda errors (defaults to `true`).
- `captureUnhandledRejections` - capture unhandled Promise rejections (defaults to `true`).
- `captureUncaughtException` - capture uncaught exceptions (defaults to `true`).
- `captureMemory` - monitor memory usage (defaults to `true`).
- `captureTimeouts` - monitor execution timeouts (defaults to `true`).

#### Example

```js
import withSentry from "serverless-sentry-lib";

// Wrap handler for automated error and exception logging
const withSentryOptions = {
  sentryOptions: {
    /* Custom Sentry configuration options */
    httpProxy: "...",
    httpsProxy: "...",
  },
  scope: {
    tags: {
      /* additional tags to send to Sentry */
      Foo: "bar",
    },
  },
  captureErrors: false,
  captureUnhandledRejections: true,
  captureUncaughtException: true,
  captureMemory: true,
  captureTimeouts: true,
};

export const handler = withSentry(withSentryOptions, async (event, context) => {
  console.log("EVENT: \n" + JSON.stringify(event, null, 2));
  return context.logStreamName;
});
```

### Accessing the Sentry Client for Capturing Custom Messages and Exceptions

If you want to capture a message or exception from anywhere in your code, simply use the Sentry client as usual. It is a singleton instance and doesn't need to be configured again:

#### CommonJS

```js
const Sentry = require("@sentry/node");
Sentry.captureMessage("Hello from Lambda!", { level: "info" });
```

#### ES6 Modules

```js
import * as Sentry from "@sentry/node";
Sentry.captureMessage("Hello from Lambda!", { level: "info" });
```

For further documentation on how to use it to capture your own messages refer to [docs.getsentry.com](https://docs.getsentry.com/hosted/clients/node/usage/).

### Capturing Unhandled Promise Rejections

When enabled all Promise rejections that aren't handled by yourself will be reported to Sentry.

### Capturing Uncaught Exceptions

Typically, if your Lambda code throws an unhandled exception somewhere in the code, the invocation is immediately aborted and the function exits with a "`Process exited before completing request`". The plugin captures these unhandled exceptions, forwards them to Sentry and then exits the Lambda with an error code.

### Local Development

By default the library will only forward errors to Sentry when deployed on AWS Lambda, not during local development. If you want to change this behavior set the `filterLocal` option to `false`.

### Detecting Slow Running Code

It's a good practice to specify the function timeout in `serverless.yml` to be at last twice as large as the _expected maximum execution time_. If you specify a timeout of 6 seconds (the default), this plugin will warn you if the function runs for 3 or more seconds. That means it's time to either review your code for possible performance improvements or increase the timeout value slightly.

### Low Memory Warnings

The plugin will automatically generate a warning if the memory consumption of your Lambda function crosses 75% of the allocated memory limit. The plugin samples the amount of memory used by Node.js every 500 milliseconds (using `process.memoryUsage()`), independently of any garbage collection. As with all Node.js code, it is important to remember that JavaScript code runs single-threaded and the monitoring function will only be able to sample memory usage if your code is in a wait state, e.g. during database queries or when calling asynchronous functions with a callback.

Only one low memory warning will be generated per function invocation. You might want to increase the memory limit step by step until your code runs without warnings.

### Turn Sentry Reporting On/Off

Sentry reporting is only enabled if you wrap your code using `withSentry` as shown in the examples above. In addition, error
reporting is only active if the `SENTRY_DSN` environment variable is set or if you explicitly pass `{ sentryOptions: { dsn } }` as configuration options. This is an easy way to enable or disable reporting as a whole or for specific functions.

In some cases, it might be desirable to disable only error reporting itself but keep the advanced features such as timeout and low memory warnings in place. This can be achieved via setting the respective options in the environment variables or `withSentry` during initialization:

```js
const withSentry = require("serverless-sentry-lib");

// Wrap handler but disable error capturing; all other options will remain the default
module.exports.handler = withSentry({ captureErrors: false }, (event, context, callback) => {
  // your Lambda Functions Handler code goes here...
});
```

## Version History

### 2.5.2

- Fixed invalid `@sentry/integrations` peer dependency definition. Sorry :(

### 2.5.1

- `@sentry/integrations` is a peer dependency now. Make sure to install it in your project!

### 2.5.0

- Added support for `@sentry/node` v7. This is the recommended version now.
- Updated dependencies

### 2.4.0

- Updated dependencies

### 2.3.0

- Override existing `unhandledRejection` and `uncaughtException` listeners when `captureUnhandledRejections` or `captureUncaughtExceptions` are enabled and invoke them _after_ we handled them. At the same time we disable Sentry's default integrations for both to avoid duplicate reporting. This works around a custom listener registered by AWS Lambda internally that prevents proper automatic handling with Sentry. Thanks to [ffxsam](https://github.com/ffxsam) for reporting the original issue. By updating the execution order of the listeners we keep side effects to a minimum. Please report back if you encounter any weird or unexpected behavior!
- Upgraded all dependencies, use Typescript 4.0

### 2.2.0

- Reset the scope on every Lambda start (if no custom Sentry client instance is used). This should avoid breadcrumbs and extras from previous runs "bleeding" into subsequent Lambda invocations. Thanks to [demsey2](https://github.com/demsey2) for reporting the original issue.
- Added a new `flushTimeout` option to control how long we want to wait for data to be written to Sentry before the Lambda shuts down or between invocations.
- Deprecated `captureMemoryWarnings` and `captureTimeoutWarnings` in favor of new options `captureMemory` and `captureTimeouts` which allow more customization. Thanks to [keanolane](https://github.com/keanolane) for suggesting custom timeouts. This only affects users invoking `withSentry` with custom options. If you're using `serverless-sentry-plugin` to set all options you won't have to change anything.
- Fixed an issue with custom tags, extras and user traits not being set when passed as options to `withSentry`. Thanks to [blelump](https://github.com/blelump) for reporting and providing a pull request.

### 2.1.0

- Explicitly check environment variables `IS_OFFLINE` and `IS_LOCAL` for truthy strings (`yes`, `on`, `true`, `t`, or `1`). Thanks to [danilofuchs](https://github.com/danilofuchs) for suggesting it.
- Flush to Sentry when the Lambda function finishes but doesn't close Sentry yet as we might get called again. [#23](https://github.com/arabold/serverless-sentry-lib/issues/23)

### 2.0.1

- Fixed some type resolution issues in the generated TypeScript definition file

### 2.0.0

- Rewrite using TypeScript. The use of TypeScript in your project is fully optional, but if you do, we got you covered!
- Added new default uncaught exception handler.
- Dropped support for Node.js 6 and 8. The only supported versions are Node.js 10 and 12.
- Upgrade from Sentry SDK `raven` to the _Unified Node.js SDK_ [`@sentry/node`](https://docs.sentry.io/error-reporting/configuration/?platform=node).
- Simplified integration using `withSentry` higher-order function. Passing the Sentry instance is now optional.
- Thank you [@aheissenberger](https://github.com/aheissenberger) and [@Vadorequest](https://github.com/Vadorequest) for their contributions to this release! 🤗

### Support

That you for supporting me and my projects.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=8Q53B78GGYQAJ&currency_code=USD&source=url)
