/* eslint-disable promise/no-promise-in-callback, promise/no-callback-in-promise */

import * as SentryLib from "@sentry/node";
import { Callback, Context } from "aws-lambda";

// We export a custom `Handler` type here so the `withSentry` type can be resolved without
// the need of any third party library. The types `Context` and `Callback` will still require
// the import of the `aws-lambda` package though.
/**
 * {@link Handler} context parameter.
 * See {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html AWS documentation}.
 */
export type Handler<TEvent = any, TResult = any> = (
  event: TEvent,
  context: Context,
  callback: Callback<TResult>,
) => void | Promise<TResult>;

export type CaptureMemoryOptions = {
  enabled: boolean;
  /**
   * How often to check for low memory warnings (in milliseconds; defaults to 500)
   */
  interval?: number;
};

export type CaptureTimeoutOptions = {
  enabled: boolean;
  /**
   * When to generate a warning (defaults to half of the remaining Lambda execution time)
   */
  timeRemainingWarning?: number;
  /**
   * When to generate an error (defaults to `500` milliseconds before the Lambda will actually timeout)
   */
  timeRemainingError?: number;
};

/**
 * Serverless Sentry Lib Configuration
 */
export type WithSentryOptions = {
  /**
   * Use the given Sentry instance instead instead of importing it automatically
   */
  sentry?: typeof SentryLib;

  /**
   * Additional Sentry options.
   * Only has an effect if no custom Sentry instance is used.
   */
  sentryOptions?: SentryLib.NodeOptions;
  /**
   * Custom scope settings
   * Only has an effect if no custom Sentry instance is used.
   */
  scope?: {
    tags?: { [key: string]: string };
    extras?: { [key: string]: any };
    user?: SentryLib.User | null;
  };
  /**
   * Don't report errors from local environments (defaults to `true`).
   * Only has an effect if no custom Sentry instance is used.
   */
  filterLocal?: boolean;
  /**
   * Enable source maps (defaults to `false`).
   * Only has an effect if no custom Sentry instance is used.
   */
  sourceMaps?: boolean;
  /**
   * Optional timeout when flushing Sentry events before exiting the Lambda (in millisecs)
   */
  flushTimeout?: number;

  /** Automatically create breadcrumbs (see Sentry SDK docs, default to `true`) */
  autoBreadcrumbs?: boolean;
  /** Capture Lambda errors (defaults to `true`) */
  captureErrors?: boolean;
  /** Capture unhandled Promise rejections (defaults to `true`) */
  captureUnhandledRejections?: boolean;
  /** Capture uncaught exceptions (defaults to `true`) */
  captureUncaughtException?: boolean;
  /**
   * Monitor memory usage (defaults to `true`)
   * @deprecated - use `captureMemory` instead
   */
  captureMemoryWarnings?: boolean;
  /** Monitor memory usage (defaults to `true`) */
  captureMemory?: boolean | CaptureMemoryOptions;
  /**
   * Monitor execution timeouts (defaults to `true`)
   * @deprecated - use `captureTimeouts` instead
   */
  captureTimeoutWarnings?: boolean;
  /** Monitor execution timeouts (defaults to `true`) */
  captureTimeouts?: boolean | CaptureTimeoutOptions;
};

/**
 * Tries to convert any given value into a boolean `true`/`false`.
 *
 * @param value - Value to parse
 * @param defaultValue - Default value to use if no valid value was passed
 */
function parseBoolean(value: any, defaultValue: boolean = false): boolean {
  const v = String(value).trim().toLowerCase();
  if (["true", "t", "1", "yes", "y", "on"].includes(v)) {
    return true;
  } else if (["false", "f", "0", "no", "n", "off"].includes(v)) {
    return false;
  } else {
    return defaultValue;
  }
}

/** Type Guard: Check if passed value is a Sentry instance */
function isSentryInstance(value: any): value is typeof SentryLib {
  return typeof value?.captureException === "function" && typeof value?.captureMessage === "function";
}

/**
 * Initialize Sentry. This function is called by `withSentry` if no custom Sentry instance is
 * passed. Do not invoke directly!
 *
 * @param options - Plugin configuration. This is NOT optional!
 */
function initSentry(options: WithSentryOptions): typeof SentryLib | undefined {
  // Check for local environment
  const isLocalEnv =
    parseBoolean(process.env.IS_OFFLINE) || parseBoolean(process.env.IS_LOCAL) || !process.env.LAMBDA_TASK_ROOT;
  if (options.filterLocal && isLocalEnv) {
    // Running locally.
    console.warn("Sentry disabled in local environment.");
    return undefined;
  }

  if (!process.env.SENTRY_DSN && !options?.sentryOptions?.dsn) {
    // No DSN set
    console.warn("SENTRY_DSN not set. Sentry is disabled.");
    return undefined;
  }

  // No sentry client has been passed so we initialize it ourselves
  const sentryClient = SentryLib;
  const sentryOptions: SentryLib.NodeOptions = { ...options.sentryOptions };

  // add integration to fix Sourcemap path
  if (options.sourceMaps && typeof sentryOptions.integrations !== "function") {
    const rewriteFramesLoaded = sentryOptions.integrations?.find((integration) => integration.name === "RewriteFrames");
    if (!rewriteFramesLoaded) {
      try {
        const { RewriteFrames } = require("@sentry/integrations");
        const path = require("path");
        sentryOptions.integrations = [
          ...(sentryOptions.integrations ?? []),
          new RewriteFrames({
            iteratee: (frame: SentryLib.StackFrame) => {
              if (frame.filename?.startsWith("/") && !frame.filename.includes("/node_modules/")) {
                frame.filename = "app:///" + path.basename(frame.filename);
              }
              return frame;
            },
          }),
        ];
      } catch (error) {
        console.warn("Failed to initialze sourcemaps", error);
      }
    }
  }

  // We're merging the plugin config options with the Sentry options. This
  // allows us to control all aspects of Sentry in a single location -
  // our plugin configuration.
  sentryClient.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT,
    ...sentryOptions,
  });

  console.log("Sentry initialized.");
  return sentryClient;
}

// Timers
/** Watch memory usage */
let memoryWatchTimer: NodeJS.Timeout | null;
/** Warn if we're about to reach the timeout */
let timeoutWarningTimer: NodeJS.Timeout | null;
/** Error if timeout is reached */
let timeoutErrorTimer: NodeJS.Timeout | null;

/**
 * Install Watchdog timers
 *
 * @param pluginConfig
 * @param lambdaContext
 */
function installTimers(sentryClient: typeof SentryLib, pluginConfig: WithSentryOptions, lambdaContext: Context) {
  const timeRemaining = lambdaContext.getRemainingTimeInMillis();
  const memoryLimit = Number(lambdaContext.memoryLimitInMB);
  const flushTimeout = pluginConfig.flushTimeout ?? pluginConfig.sentryOptions?.shutdownTimeout ?? 2000;
  const captureTimeouts =
    pluginConfig.captureTimeouts === true || (pluginConfig.captureTimeouts as CaptureTimeoutOptions)?.enabled;
  const timeoutWarningMsec = Math.floor(
    (pluginConfig.captureTimeouts as CaptureTimeoutOptions)?.timeRemainingWarning ?? timeRemaining / 2,
  );
  const timeoutErrorMsec = Math.floor(
    (pluginConfig.captureTimeouts as CaptureTimeoutOptions)?.timeRemainingError ?? flushTimeout,
  );
  const captureMemory =
    pluginConfig.captureMemory === true || (pluginConfig.captureMemory as CaptureMemoryOptions)?.enabled;
  const captureMemoryInterval = Math.floor((pluginConfig.captureMemory as CaptureMemoryOptions)?.interval ?? 500);

  /** Watch for Lambdas approaching half of the defined timeout value */
  const timeoutWarningFunc = (cb: Callback<any>) => {
    sentryClient.withScope((scope) => {
      scope.setLevel(SentryLib.Severity.Warning);
      scope.setExtras({
        TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
      });
      sentryClient.captureMessage("Function Execution Time Warning");
    });
    sentryClient
      .flush(flushTimeout)
      .then(() => cb?.())
      .catch(null);
  };

  /** Watch for Lambdas approaching timeouts; Note that we might not have enough time to even report this anymore */
  const timeoutErrorFunc = (cb: Callback<any>) => {
    sentryClient.withScope((scope) => {
      scope.setLevel(SentryLib.Severity.Error);
      scope.setExtras({
        TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
      });
      sentryClient.captureMessage("Function Timed Out");
    });
    sentryClient
      .flush(flushTimeout)
      .then(() => cb?.())
      .catch(null);
  };

  /** Watch for Lambdas running out of memory */
  const memoryWatchFunc = (cb: Callback<any>) => {
    const used = process.memoryUsage().rss / 1048576;
    const p = used / memoryLimit;
    if (p >= 0.75) {
      sentryClient.withScope((scope) => {
        scope.setLevel(SentryLib.Severity.Warning);
        scope.setExtras({
          MemoryLimitInMB: memoryLimit,
          MemoryUsedInMB: Math.floor(used),
        });
        sentryClient.captureMessage("Low Memory Warning");
      });
      sentryClient
        .flush(flushTimeout)
        .then(() => cb?.())
        .catch(null);
    } else {
      // The memory watchdog is triggered twice a second
      memoryWatchTimer = setTimeout(memoryWatchFunc, captureMemoryInterval);
    }
  };

  if (
    captureTimeouts &&
    timeoutWarningMsec > 0 &&
    timeoutErrorMsec > 0 &&
    timeRemaining > timeoutWarningMsec &&
    timeRemaining > timeoutErrorMsec
  ) {
    // We schedule the warning at half the maximum execution time and
    // the error a few milliseconds before the actual timeout happens.
    timeoutWarningTimer = setTimeout(timeoutWarningFunc, timeRemaining - timeoutWarningMsec);
    timeoutErrorTimer = setTimeout(timeoutErrorFunc, timeRemaining - timeoutErrorMsec);
  }

  if (captureMemory && captureMemoryInterval > 0) {
    // Schedule memory watch dog interval. Note that we're not using
    // setInterval() here as we don't want invokes to be skipped.
    memoryWatchTimer = setTimeout(memoryWatchFunc, captureMemoryInterval);
  }
}

/**
 * Stops and removes all timers
 */
function clearTimers() {
  if (timeoutWarningTimer) {
    clearTimeout(timeoutWarningTimer);
    timeoutWarningTimer = null;
  }
  if (timeoutErrorTimer) {
    clearTimeout(timeoutErrorTimer);
    timeoutErrorTimer = null;
  }
  if (memoryWatchTimer) {
    clearTimeout(memoryWatchTimer);
    memoryWatchTimer = null;
  }
}

/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export function withSentry<TEvent = any, TResult = any>(handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param pluginConfig - Plugin configuration
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export function withSentry<TEvent = any, TResult = any>(
  pluginConfig: WithSentryOptions,
  handler: Handler<TEvent, TResult>,
): Handler<TEvent, TResult>;
/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param SentryInstance - Sentry client
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export function withSentry<TEvent = any, TResult = any>(
  SentryInstance: typeof SentryLib,
  handler: Handler<TEvent, TResult>,
): Handler<TEvent, TResult>;

export function withSentry<TEvent = any, TResult = any>(
  arg1: WithSentryOptions | typeof SentryLib | Handler<TEvent, TResult>,
  arg2?: Handler<TEvent, TResult>,
): Handler<TEvent, TResult> {
  /** Original handler function */
  let handler: Handler<TEvent, TResult>;
  /** Custom Sentry client passed as function argument (optional) */
  let customSentryClient: typeof SentryLib | undefined;
  /** Custom options passed as function argument */
  let customOptions: Partial<WithSentryOptions>;
  if (typeof arg1 === "function") {
    // No Sentry of config passed
    customOptions = {};
    handler = arg1;
  } else if (isSentryInstance(arg1) && typeof arg2 === "function") {
    // Passed in the Sentry client object directly
    customSentryClient = arg1;
    customOptions = {};
    handler = arg2;
  } else if (!isSentryInstance(arg1) && typeof arg1 === "object" && typeof arg2 === "function") {
    customOptions = { ...arg1 };
    handler = arg2;
  } else {
    throw TypeError("Invalid args passed to withSentry");
  }

  const options: WithSentryOptions = {
    // Set default options
    scope: { tags: {}, extras: {}, user: {} },
    captureErrors: parseBoolean(process.env.SENTRY_CAPTURE_ERRORS, true),
    captureUnhandledRejections: parseBoolean(process.env.SENTRY_CAPTURE_UNHANDLED, true),
    captureUncaughtException: parseBoolean(process.env.SENTRY_CAPTURE_UNCAUGHT, true),
    captureMemory: parseBoolean(process.env.SENTRY_CAPTURE_MEMORY, true),
    captureTimeouts: parseBoolean(process.env.SENTRY_CAPTURE_TIMEOUTS, true),
    autoBreadcrumbs: parseBoolean(process.env.SENTRY_AUTO_BREADCRUMBS, true),
    filterLocal: parseBoolean(process.env.SENTRY_FILTER_LOCAL, true),
    sourceMaps: parseBoolean(process.env.SENTRY_SOURCEMAPS, false),
    // Merge in custom options at the end
    ...customOptions,
  };

  if (typeof options.captureMemoryWarnings !== "undefined") {
    console.warn("`WithSentryOptions#captureMemoryWarnings` is deprecated. Use `captureMemory` instead!");
    options.captureMemory = options.captureMemory ?? options.captureMemoryWarnings;
  }
  if (typeof options.captureTimeoutWarnings !== "undefined") {
    console.warn("`WithSentryOptions#captureTimeoutWarnings` is deprecated. Use `captureTimeouts` instead!");
    options.captureTimeouts = options.captureTimeouts ?? options.captureTimeoutWarnings;
  }

  // Install sentry
  const sentryClient = customSentryClient ?? options.sentry ?? initSentry(options);
  const flushTimeout = options.flushTimeout ?? options.sentryOptions?.shutdownTimeout;

  // Create a new handler function wrapping the original one and hooking into all callbacks
  return (event: any, context: Context, callback: Callback<any>) => {
    if (!sentryClient) {
      // Pass-through to the original handler and return
      return handler(event, context, callback);
    }

    // Additional context to be stored with Sentry events and messages
    const additionalScope: WithSentryOptions["scope"] = {
      extras: {
        Event: event,
        Context: context,
      },
      tags: {
        lambda: String(process.env.AWS_LAMBDA_FUNCTION_NAME),
        version: String(process.env.AWS_LAMBDA_FUNCTION_VERSION),
        memory_size: String(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
        log_group: String(process.env.AWS_LAMBDA_LOG_GROUP_NAME),
        log_stream: String(process.env.AWS_LAMBDA_LOG_STREAM_NAME),
        region: String(process.env.SERVERLESS_REGION || process.env.AWS_REGION),
      },
    };

    if (process.env.SERVERLESS_SERVICE) additionalScope.tags!.service_name = process.env.SERVERLESS_SERVICE;
    if (process.env.SERVERLESS_STAGE) additionalScope.tags!.stage = process.env.SERVERLESS_STAGE;
    if (process.env.SERVERLESS_ALIAS) additionalScope.tags!.alias = process.env.SERVERLESS_ALIAS;

    // Depending on the endpoint type the identity information can be at
    // event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
    const identity =
      context.identity?.constructor === Object && Object.keys(context.identity).length > 0
        ? context.identity
        : event.requestContext?.identity;

    if (identity) {
      // Track the caller's Cognito identity
      // id, username and ip_address are key fields in Sentry
      additionalScope.user = {
        ...additionalScope.user,
        id: identity.cognitoIdentityId || undefined, // turn empty string and null into undefined
        username: identity.user || undefined,
        ip_address: identity.sourceIp || undefined,
        cognito_identity_pool_id: identity.cognitoIdentityPoolId,
        cognito_authentication_type: identity.cognitoAuthenticationType,
        user_agent: identity.userAgent,
      };
    }

    // Add additional tags for AWS_PROXY endpoints
    if (event.requestContext) {
      additionalScope.tags = {
        ...additionalScope.tags,
        api_id: event.requestContext.apiId,
        api_stage: event.requestContext.stage,
        http_method: event.requestContext.httpMethod,
      };
    }

    sentryClient.configureScope((scope) => {
      if (!customSentryClient) {
        // Make sure we work with a clean scope as AWS is reusing our Lambda instance if it's already warm
        scope.clear();
      }
      scope.setUser({ ...additionalScope.user, ...options.scope?.user });
      scope.setExtras({ ...additionalScope.extras, ...options.scope?.extras });
      scope.setTags({ ...additionalScope.tags, ...options.scope?.tags });
    });

    // Monitor for timeouts and memory usage
    // The timers will be removed in `finalize` function below
    installTimers(sentryClient, options, context);

    const unhandledRejectionListener = (err: any, p: Promise<any>) => {
      sentryClient.withScope((scope) => {
        scope.setLevel(SentryLib.Severity.Error);
        scope.setExtras({
          Error: err,
          Promise: p,
        });
        sentryClient.captureMessage(`Unhandled Promise Rejection - ${err}`);
      });
    };
    if (options.captureUnhandledRejections) {
      // Enable capturing of unhandled rejections
      process.on("unhandledRejection", unhandledRejectionListener);
    }

    const uncaughtExceptionListener = (err: any) => {
      sentryClient.withScope((scope) => {
        scope.setLevel(SentryLib.Severity.Fatal);
        sentryClient.captureException(err);
      });
      // Now exit the process; there is no recovery from this
      sentryClient
        .close(flushTimeout)
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    };
    if (options.captureUncaughtException) {
      // Enable capturing of uncaught exceptions
      process.removeAllListeners("uncaughtException"); // there can be only one
      process.on("uncaughtException", uncaughtExceptionListener);
    }

    /** Finalize withSentry wrapper, flush messages and remove all listeners */
    const finalize = async () => {
      clearTimers();

      options.captureUnhandledRejections && process.removeListener("unhandledRejection", unhandledRejectionListener);
      options.captureUncaughtException && process.removeListener("uncaughtException", uncaughtExceptionListener);

      if (!customSentryClient) {
        // Use `flush`, not `close` here as the Lambda might be kept alive and we don't want
        // to break our Sentry instance
        await sentryClient.flush(flushTimeout);
      }
    };

    if (options.autoBreadcrumbs) {
      // First breadcrumb is the invocation of the Lambda itself
      const breadcrumb: SentryLib.Breadcrumb = {
        message: process.env.AWS_LAMBDA_FUNCTION_NAME,
        category: "lambda",
        level: SentryLib.Severity.Info,
        data: {},
      };
      if (event.requestContext) {
        // Track HTTP request info as part of the breadcrumb
        breadcrumb.data = {
          ...breadcrumb.data,
          http_method: event.requestContext?.httpMethod,
          host: event.headers?.Host,
          path: event.path,
          user_agent: event.headers?.["User-Agent"],
        };
      }
      sentryClient.addBreadcrumb(breadcrumb);
    }

    // And finally invoke the original handler code
    let callbackCalled = false;
    const response = handler(event, context, (err, data) => {
      // We wrap the original callback here
      callbackCalled = true;
      if (err && options.captureErrors) {
        sentryClient.captureException(err);
      }
      finalize()
        .finally(() => callback(err, data)) // invoke the original callback
        .catch(null);
    });

    if (!callbackCalled && typeof response === "object" && typeof response.then === "function") {
      // The handler returned a promise instead of invoking the callback function
      const resolveResponseAsync = async () => {
        try {
          // resolve the response
          return await response;
        } catch (err) {
          // Promise rejected
          if (options.captureErrors) {
            sentryClient.captureException(err);
          }
          throw err; // continue throwing
        } finally {
          // Cleanup
          await finalize();
        }
      };
      return resolveResponseAsync();
    } else {
      return response;
    }
  };
}

export default withSentry;
module.exports = withSentry;

// TypeScript imports the `default` property for
// an ES2015 default import (`import test from 'ava'`)
// See: https://github.com/Microsoft/TypeScript/issues/2242#issuecomment-83694181
module.exports.default = withSentry;
