# ⚡️ Sentry/Raven SDK Integration For AWS Lambda and Serverless

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm](https://img.shields.io/npm/v/serverless-sentry-lib.svg)](https://www.npmjs.com/package/serverless-sentry-lib)
[![license](https://img.shields.io/github/license/arabold/serverless-sentry-lib.svg)](https://github.com/arabold/serverless-sentry-lib/blob/master/LICENSE)
[![dependencies](https://img.shields.io/david/arabold/serverless-sentry-lib.svg)](https://www.npmjs.com/package/serverless-sentry-lib)

## About

This library simplifies integration of Sentry's [@sentry/node](https://docs.sentry.io/clients/node/) library with AWS Lambda. The only supported platforms are the [Lambda Runtimes for Node.js 10 and 12](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html). Python and Java support will require dedicated libraries. Pull requests are welcome!

The `serverless-sentry-plugin` and `serverless-sentry-lib` libraries are not affiliated with either Functional Software Inc., Sentry, Serverless or Amazon Web Services but developed independently and in my spare time.

### Benefits

- Easy to use.
- Integrates with [Serverless Framework](http://www.serverless.com) for AWS Lambda (though use of the framework is not required).
- Wraps your Node.js code with [Sentry](http://getsentry.com) error capturing.
- Forwards any errors returned by your AWS Lambda function to Sentry.
- Warn if your code is about to hit the execution timeout limit.
- Warn if your Lambda function is low on memory.
- Catches and reports unhandled exceptions.
- Serverless, Sentry and as well as this library are all Open Source. Yay! 🎉

## Installation

- Install the `@sentry/node` module:
  ```sh
  npm install --save @sentry/node
  ```
- Install this module:
  ```sh
  npm install --save serverless-sentry-lib
  ```
- Check out the examples below how to integrate it with your project by updating `serverless.yml` as well as your Lambda handler code.

Although this library is written in TypeScript, the resulting library uses exclusively Node 10 features to ensure this code can run on AWS Lambda without any additional transpiling or further processing. We also do not use _any_ 3rd party node module other than `@sentry/node` itself.

This library can be used standalone or as part of the [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin).

### Use as Standalone Library

If you don't want to add another plugin to Serverless, you can use this library standalone without additional dependencies (besides `@sentry/node` itself).

You will need to extend your `serverless.yml` to include additional environment variables. The only required environment variable is `SENTRY_DSN`
to set the [DSN url](https://docs.sentry.io/quickstart/#configure-the-dsn) for your reporting. A full list of available environment variables is available below.

```yaml
service: my-serverless-project
provider:
  # ...
  environment:
    SENTRY_ENVIRONMENT: ${opt:stage, self:provider.stage} # recommended
    SENTRY_DSN: https://xxxx:yyyy@sentry.io/zzzz # URL provided by Sentry
```

### Use Together With the Serverless Sentry Plugin

The [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin) allows configuration of the library through the `serverless.yml`
and will upload your source-maps automatically during deployment. This is the recommended way of using the `serverless-sentry-lib` library.

Instead of manually setting environment variables the plugin determines and sets them automatically. In the `serverless.yml` simply load the plugin and set the `dsn` configuration option as follows:

```yaml
service: my-serverless-project
provider:
  # ...
plugins: serverless-sentry
custom:
  sentry:
    dsn: https://xxxx:yyyy@sentry.io/zzzz # URL provided by Sentry
```

You can still manually set environment variables on a per-function level to overwrite the plugin's ones.

### Environment Variables

Logging tags can be controlled through the following environment variables. You can set them manually in your `serverless.yml` or let them be configured automatically using the [Serverless Sentry Plugin](https://github.com/arabold/serverless-sentry-plugin) during deployment.

| Environment Variable       | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `SENTRY_DSN`               | Sentry DSN Url                                                            |
| `SENTRY_ENVIRONMENT`       | Environment (optional, e.g. "dev" or "prod")                              |
| `SENTRY_RELEASE`           | Release number of your project (optional)                                 |
| `SENTRY_AUTO_BREADCRUMBS`  | Automatically create breadcrumbs (see Sentry SDK docs, default to `true`) |
| `SENTRY_FILTER_LOCAL`      | Don't report errors from local environments (defaults to `true`)          |
| `SENTRY_CAPTURE_ERRORS`    | Enable capture Lambda errors (defaults to `true`)                         |
| `SENTRY_CAPTURE_UNHANDLED` | Enable capture unhandled exceptions (defaults to `true`)                  |
| `SENTRY_CAPTURE_MEMORY`    | Enable monitoring memory usage (defaults to `true`)                       |
| `SENTRY_CAPTURE_TIMEOUTS`  | Enable monitoring execution timeouts (defaults to `true`)                 |
| `SENTRY_SOURCEMAPS`        | Enable webpack sourcemaps support (defaults to `false`)                   |

In addition the library checks for the following optional variables and adds them as custom tags automatically:

| Environment Variable | Sentry Tag   | Description                                                                                             |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `SERVERLESS_SERVICE` | service_name | Serveless service name                                                                                  |
| `SERVERLESS_STAGE`   | stage        | Serverless stage                                                                                        |
| `SERVERLESS_ALIAS`   | alias        | Serverless alias, see [Serverless AWS Alias Plugin](https://github.com/hyperbrain/serverless-aws-alias) |
| `SERVERLESS_REGION`  | region       | Serverless region name                                                                                  |

## Usage

For maximum flexibility this library is implemented as a wrapper around your original AWS Lambda handler code (your `handler.js` or similar). The
`SentryLambdaWrapper` adds error and exception handling, and takes care of configuring the Sentry client automatically.

The `SentryLambdaWrapper` is pre-configured to reasonable defaults and doesn't need much setup. Simply pass in your Sentry client to the wrapper
function as shown below - that's it. Passing in your own `Sentry` client is necessary to ensure that the wrapper uses the same environment as the rest of your code. In the rare circumstances that this isn't desired, you can pass in `null` instead.

**ES2015: Original Lambda Handler Code Before Adding SentryLambdaWrapper**:

```js
"use strict";

module.exports.hello = function (event, context, callback) {
  callback(null, { message: "Go Serverless! Your function executed successfully!", event });
};
```

**ES2015: New Lambda Handler Code With SentryLambdaWrapper For Sentry Reporting**

```js
"use strict";

const Sentry = require("@sentry/node"); // Official `Unified Node.js SDK` module
const SentryLambdaWrapper = require("serverless-sentry-lib"); // This helper library

module.exports.hello = SentryLambdaWrapper.handler(Sentry, (event, context, callback) => {
  // Here follows your original Lambda handler code...
  callback(null, { message: "Go Serverless! Your function executed successfully!", event });
});
```

**ES2017: Original Lambda Handler Code Before Adding SentryLambdaWrapper**:

```js
exports.handler = async (event, context) => {
  return { message: "Go Serverless! Your function executed successfully!", event };
};
```

**ES2017: New Lambda Handler Code With SentryLambdaWrapper For Sentry Reporting**

```js
const Sentry = require("@sentry/node"); // Official `Unified Node.js SDK` module
const SentryLambdaWrapper = require("serverless-sentry-lib"); // This helper library

exports.handler = SentryLambdaWrapper.handler(Sentry, async (event, context) => {
  // Here follows your original Lambda handler code...
  return { message: "Go Serverless! Your function executed successfully!", event };
});
```

Once your Lambda handler code is wrapped in the `SentryLambdaWrapper`, it will be extended it with automatic error reporting. Whenever your Lambda handler sets an error response, the error is forwarded to Sentry with additional context information.

### Setting Custom Configuration Options

As shown above you can use environment variables to control the Sentry integration. In some scenarios in which environment variables are not desired or in which custom logic needs to be executed, you can also pass in configuration options to the `SentryLambdaWrapper` directly:

- `sentryClient` - Your Sentry client. Don't forget to set this if you send your
  own custom messages and exceptions to Sentry later in your code.
- `autoBreadcrumbs` - Automatically create breadcrumbs (see Sentry SDK docs,
  defaults to `true`)
- `filterLocal` - don't report errors from local environments (defaults to `true`)
- `captureErrors` - capture Lambda errors (defaults to `true`)
- `captureUnhandledRejections` - capture unhandled exceptions (defaults to `true`)
- `captureMemoryWarnings` - monitor memory usage (defaults to `true`)
- `captureTimeoutWarnings` - monitor execution timeouts (defaults to `true`)
- `sourceMaps` - activate Integration RewriteFrames to allow to use uploaded sourcemaps with AWS Lambda (defaults to `false`)

```js
const SentryLambdaWrapper = require("serverless-sentry-lib");

// Wrap handler for automated error and exception logging
const sentryConfig = {
  captureErrors: false,
  captureUnhandledRejections: true,
  captureMemoryWarnings: true,
  captureTimeoutWarnings: true,
  init: {},
  scope: {
    tags: {},
    extra: {},
    user: {},
  },
  sentryClient: require("@sentry/node"), // don't forget!
};
module.exports.handler = SentryLambdaWrapper.handler(sentryConfig, (event, context, callback) => {
  // your Lambda Functions Handler code goes here...
  Sentry.captureMessage("Hello from Lambda!", { level: "info " });
});
```

### Accessing the Sentry Client for Capturing Custom Messages and Exceptions

If you want to capture a message or exception from anywhere in your code, simply use the Sentry client as usual. It is a singleton instance and doesn't need to be configured again:

```js
const Sentry = require("@sentry/node");
Sentry.captureMessage("Hello from Lambda!", { level: "info " });
```

For further documentation on how to use it to capture your own messages refer to [docs.getsentry.com](https://docs.getsentry.com/hosted/clients/node/usage/).

### Capturing Unhandled Exceptions

Typically, if your Lambda code throws an unhandled exception somewhere in the code, the invocation is immediately aborted and the function exits with a "`Process exited before completing request`". The plugin captures these unhandled exceptions, forwards them to Sentry and returns the exception like any regular error generated by your function.

### Local Development

By default the library will only forward errors to Sentry when deployed on AWS Lambda, not during local development. If you want to change this behavior set the `filterLocal` option to `false`.

### Detecting Slow Running Code

It's a good practice to specify the function timeout in `serverless.yml` to be at last twice as large as the _expected maximum execution time_. If you specify a timeout of 6 seconds (the default), this plugin will warn you if the function runs for 3 or more seconds. That means it's time to either review your code for possible performance improvements or increase the timeout value slightly.

### Low Memory Warnings

The plugin will automatically generate a warning if the memory consumption of your Lambda function crosses 75% of the allocated memory limit. The plugin samples the amount of memory used by Node.js every 500 milliseconds (using `process.memoryUsage()`), independently of any garbage collection. As with all Node.js code, it is important to remember that JavaScript code runs single-threaded and the monitoring function will only be able to sample memory usage if your code is in a wait state, e.g. during database queries or when calling asynchronous functions with a callback.

Only one low memory warning will be generated per function invocation. You might want to increase the memory limit step by step until your code runs without warnings.

### Turn Sentry Reporting On/Off

Obviously Sentry reporting is only enabled if you wrap your code using the `SentryLambdaWrapper` as shown in the examples above. In addition, error
reporting is only active if the `SENTRY_DSN` environment variable is set. This is an easy way to enable or disable reporting as a whole or for specific functions.

In some cases it might be desirable to disable only error reporting itself but keep the advanced features such as timeout and low memory warnings in place. This can be achieved via setting the respective options in the environment variables or the `SentryLambdaWrapper` during initialization:

```js
const SentryLambdaWrapper = require("serverless-sentry-lib");

// Wrap handler for automated error and exception logging
const sentryConfig = {
  captureErrors: false, // Don't log error responses from the Lambda ...
  captureUnhandledRejections: true, // but keep unhandled exception logging, ...
  captureMemoryWarnings: true, // memory warnings ...
  captureTimeoutWarnings: true, // and timeout warnings enabled.
  sentryClient: require("@sentry/node"),
};
module.exports.handler = SentryLambdaWrapper.handler(sentryConfig, (event, context, callback) => {
  // your Lambda Functions Handler code goes here...
});
```

## Version History

### 2.0.0

- Rewrite using TypeScript. The use of TypeScript in your project is fully optional, but if you do, we got you covered!
- Dropped support for Node.js 6 and 8. The only supported versions are Node.js 10 and 12.
- Upgrade from sentry SDK `raven` to new _Unified Node.js SDK_ [`@sentry/node`](https://docs.sentry.io/error-reporting/configuration/?platform=node)
- ⚠️ _ravenClient_ is now _sentryClient_
- ⚠️ remove global _sls_sentry_ for backward compatibility with oldserverless-sentry-plugin 0.2.x/0.3.x
- Thank you [@aheissenberger](https://github.com/aheissenberger) and [@Vadorequest](https://github.com/Vadorequest) for their contributions to this release! 🤗

### 1.1.2

- Fixed async/await (Promises) handling in Node 8.10. Thanks to
  [shouki-s](https://github.com/shouki-s) for the contribution.

### 1.1.1

- Fixed main entry point in `package.json`

### 1.1.0

- ⚠️ Dropped support for Node 4.3. AWS deprecates Node 4.3 starting July 31, 2018.
- Added support for Node 8.10 async/await (Promises) function handlers. Thanks to
  [chechu](https://github.com/chechu) for his contribution.
- Added test cases.

### 1.0.1

- Fixed an issue with `context.callbackWaitsForEmptyEventLoop` not working properly if set
  outside of `RavenLambdaWrapper.handler`. The `context` object is now retained and not
  cloned anymore which should make things more robust.

### 1.0.0

- Fixed reporting bugs in local environment despite config telling otherwise.
- Proper parsing of boolean configuration options from environment variables.
- `raven-node` is a peer dependency now.

### 1.0.0-rc.2

- Fixed a problem with configuration via environment variables not working
- Initialize (but disable) Sentry when running locally to avoid crashes in
  user's code.

### 1.0.0-rc.1

- First official release of this library.
