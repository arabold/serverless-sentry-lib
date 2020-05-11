/* eslint-disable promise/no-promise-in-callback, promise/no-callback-in-promise */

import * as Sentry from "@sentry/node";
import { Callback, Context } from "aws-lambda";

/**
 * Whether Sentry is installed or not
 * @type {boolean}
 */
let isSentryInstalled: boolean = false;

/**
 * Lambda Function Handler
 */
export type Handler<TEvent = any, TResult = any> = (
  event: TEvent,
  context: Context,
  callback?: Callback<TResult>,
) => void | Promise<TResult>;

/**
 * Serverless Sentry Plugin Configuration
 */
export type PluginConfig = {
  /** Sentry client instance */
  sentryClient: typeof Sentry;
  /** Additional Sentry options */
  init?: Sentry.NodeOptions;
  /** Custom scope settings */
  scope?: {
    tags?: { [key: string]: string };
    extras?: { [key: string]: any };
    user?: Sentry.User | null;
  };
  /** Don't report errors from local environments (defaults to `true`) */
  filterLocal?: boolean;
  /** Enable source maps (defaults to `false`) */
  sourceMaps?: boolean;
  /** Automatically create breadcrumbs (see Sentry SDK docs, default to `true`) */
  autoBreadcrumbs?: boolean;
  /** Capture Lambda errors (defaults to `true`) */
  captureErrors?: boolean;
  /** Capture unhandled exceptions (defaults to `true`) */
  captureUnhandledRejections?: boolean;
  /** Monitor memory usage (defaults to `true`) */
  captureMemoryWarnings?: boolean;
  /** Monitor execution timeouts (defaults to `true`) */
  captureTimeoutWarnings?: boolean;
};

/**
 * Install Sentry support
 *
 * @param pluginConfig - Plugin configuration. This is NOT optional!
 */
function installSentry(pluginConfig: PluginConfig): void {
  const sentryClient = pluginConfig.sentryClient;
  if (!sentryClient) {
    console.error("Sentry client not found.");
  }

  // Check for local environment
  const isLocalEnv = process.env.IS_OFFLINE || process.env.IS_LOCAL || !process.env.LAMBDA_TASK_ROOT;
  if (pluginConfig.filterLocal && isLocalEnv) {
    // Running locally.
    console.warn("Sentry disabled in local environment");
    delete process.env.SENTRY_DSN; // otherwise sentry will start reporting nonetheless

    sentryClient.init({ dsn: "" });

    isSentryInstalled = true;
    return;
  }

  // add integration to fix Sourcemap path
  if (pluginConfig.sourceMaps) {
    const RewriteFramesExists =
      Array.isArray(pluginConfig.init?.integrations) &&
      pluginConfig.init?.integrations.find((integration) => integration.name === "RewriteFrames");
    if (!RewriteFramesExists) {
      pluginConfig.init = pluginConfig.init ?? {};
      if (!Array.isArray(pluginConfig.init.integrations)) {
        pluginConfig.init.integrations = [];
      }

      try {
        const { RewriteFrames } = require("@sentry/integrations");
        const path = require("path");
        pluginConfig.init.integrations.push(
          new RewriteFrames({
            iteratee: (frame: Sentry.StackFrame) => {
              //console.log(frame.filename);
              if (frame.filename?.startsWith("/") && !frame.filename.includes("/node_modules/")) {
                frame.filename = "app:///" + path.basename(frame.filename);
              }
              return frame;
            },
          }),
        );
      } catch (error) {
        pluginConfig.sourceMaps = false;
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
    ...pluginConfig.init,
  });

  const tags: { [key: string]: string } = {
    lambda: String(process.env.AWS_LAMBDA_FUNCTION_NAME),
    version: String(process.env.AWS_LAMBDA_FUNCTION_VERSION),
    memory_size: String(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
    log_group: String(process.env.AWS_LAMBDA_LOG_GROUP_NAME),
    log_stream: String(process.env.AWS_LAMBDA_LOG_STREAM_NAME),
    region: String(process.env.SERVERLESS_REGION || process.env.AWS_REGION),
  };

  if (process.env.SERVERLESS_SERVICE) tags.service_name = process.env.SERVERLESS_SERVICE;
  if (process.env.SERVERLESS_STAGE) tags.stage = process.env.SERVERLESS_STAGE;
  if (process.env.SERVERLESS_ALIAS) tags.alias = process.env.SERVERLESS_ALIAS;

  sentryClient.configureScope((scope) => {
    scope.setTags({ ...tags, ...pluginConfig.scope?.tags });
  });

  isSentryInstalled = true;

  console.log("Sentry installed.");
}

// Timers
/** Watch memory usage */
let memoryWatch: NodeJS.Timeout | null;
/** Warn if we're about to reach the timeout */
let timeoutWarning: NodeJS.Timeout | null;
/** Error if timeout is reached */
let timeoutError: NodeJS.Timeout | null;

/**
 * Install Watchdog timers
 *
 * @param pluginConfig
 * @param lambdaContext
 */
function installTimers(pluginConfig: PluginConfig, lambdaContext: Context) {
  const timeRemaining = lambdaContext.getRemainingTimeInMillis();
  const memoryLimit = Number(lambdaContext.memoryLimitInMB);

  const timeoutWarningFunc = (cb: Callback<any>) => {
    const Sentry = pluginConfig.sentryClient;
    if (isSentryInstalled) {
      Sentry.withScope((scope) => {
        scope.setLevel("warning" as Sentry.Severity);
        scope.setExtras({
          TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
        });
        Sentry.captureMessage("Function Execution Time Warning");
      });
      Sentry.flush(5000)
        .then(() => cb?.())
        .catch(null);
    }
  };

  const timeoutErrorFunc = (cb: Callback<any>) => {
    const Sentry = pluginConfig.sentryClient;
    if (isSentryInstalled) {
      Sentry.withScope((scope) => {
        scope.setLevel("error" as Sentry.Severity);
        scope.setExtras({
          TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
        });
        Sentry.captureMessage("Function Timed Out");
      });
      Sentry.flush(5000)
        .then(() => cb?.())
        .catch(null);
    }
  };

  const memoryWatchFunc = (cb: Callback<any>) => {
    const used = process.memoryUsage().rss / 1048576;
    const p = used / memoryLimit;
    if (p >= 0.75) {
      const Sentry = pluginConfig.sentryClient;
      if (isSentryInstalled) {
        Sentry.withScope((scope) => {
          scope.setLevel("warning" as Sentry.Severity);
          scope.setExtras({
            MemoryLimitInMB: memoryLimit,
            MemoryUsedInMB: Math.floor(used),
          });
          Sentry.captureMessage("Low Memory Warning");
        });
        Sentry.flush(5000)
          .then(() => cb?.())
          .catch(null);
      }
    } else {
      memoryWatch = setTimeout(memoryWatchFunc, 500);
    }
  };

  if (pluginConfig.captureTimeoutWarnings) {
    // We schedule the warning at half the maximum execution time and
    // the error a few milliseconds before the actual timeout happens.
    timeoutWarning = setTimeout(timeoutWarningFunc, timeRemaining / 2);
    timeoutError = setTimeout(timeoutErrorFunc, Math.max(timeRemaining - 500, 0));
  }

  if (pluginConfig.captureMemoryWarnings) {
    // Schedule memory watch dog interval. Note that we're not using
    // setInterval() here as we don't want invokes to be skipped.
    memoryWatch = setTimeout(memoryWatchFunc, 500);
  }
}

/**
 * Stops and removes all timers
 */
function clearTimers() {
  if (timeoutWarning) {
    clearTimeout(timeoutWarning);
    timeoutWarning = null;
  }
  if (timeoutError) {
    clearTimeout(timeoutError);
    timeoutError = null;
  }
  if (memoryWatch) {
    clearTimeout(memoryWatch);
    memoryWatch = null;
  }
}

/**
 * Wraps a given callback function with error logging
 *
 * @param pluginConfig
 * @param cb - Callback function to wrap
 * @returns Wrapped callback function
 */
function wrapCallback<T>(pluginConfig: PluginConfig, cb: Callback<T>): Callback<T> {
  return (err: Error | string, data: any) => {
    // Stop watchdog timers
    clearTimers();

    // If an error was thrown we'll report it to Sentry
    if (err && err !== "__emptyFailParamBackCompat" && pluginConfig.captureErrors && isSentryInstalled) {
      const Sentry = pluginConfig.sentryClient;
      Sentry.captureException(err);
      Sentry.flush(5000)
        .then(() => cb(err))
        .catch(null);
      return;
    }
    if (err) {
      cb(err);
    } else {
      cb(err, data);
    }
  };
}

/**
 * Tries to convert any given value into a boolean `true`/`false`.
 *
 * @param value - Value to parse
 * @param defaultValue - Default value to use if no valid value was passed
 */
function parseBoolean(value: any, defaultValue: boolean): boolean {
  const v = String(value).trim().toLowerCase();
  if (["true", "t", "1", "yes", "y"].includes(v)) {
    return true;
  } else if (["false", "f", "0", "no", "n"].includes(v)) {
    return false;
  } else {
    return defaultValue;
  }
}

/** Type Guard: Check if passed value is a Sentry instance */
function isSentryInstance(value: any): value is typeof Sentry {
  return typeof value?.captureException === "function" && typeof value?.captureMessage === "function";
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
  pluginConfig: PluginConfig,
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
  SentryInstance: typeof Sentry,
  handler: Handler<TEvent, TResult>,
): Handler<TEvent, TResult>;

export function withSentry<TEvent = any, TResult = any>(
  arg1: PluginConfig | typeof Sentry | Handler<TEvent, TResult>,
  arg2?: Handler<TEvent, TResult>,
): Handler<TEvent, TResult> {
  let handler: Handler<TEvent, TResult>;
  let customPluginConfig: Partial<PluginConfig>;
  if (typeof arg1 === "function") {
    // No Sentry of config passed
    customPluginConfig = {};
    handler = arg1;
  } else if (isSentryInstance(arg1) && typeof arg2 === "function") {
    // Passed in the Sentry client object directly
    customPluginConfig = {
      sentryClient: arg1,
    };
    handler = arg2;
  } else if (!isSentryInstance(arg1) && typeof arg1 === "object" && typeof arg2 === "function") {
    // Poor man's deep clone
    customPluginConfig = {
      ...arg1,
      init: {
        ...arg1?.init,
      },
      scope: {
        ...arg1?.scope,
        tags: { ...arg1?.scope?.tags },
        extras: { ...arg1?.scope?.extras },
        user: { ...arg1?.scope?.user },
      },
    };
    handler = arg2;
  } else {
    throw TypeError("Invalid args passed to withSentry");
  }

  const defaultPluginConfig: Partial<PluginConfig> = {
    init: {},
    scope: { tags: {}, extras: {}, user: {} },
    captureErrors: parseBoolean(process.env.SENTRY_CAPTURE_ERRORS, true),
    captureUnhandledRejections: parseBoolean(process.env.SENTRY_CAPTURE_UNHANDLED, true),
    captureMemoryWarnings: parseBoolean(process.env.SENTRY_CAPTURE_MEMORY, true),
    captureTimeoutWarnings: parseBoolean(process.env.SENTRY_CAPTURE_TIMEOUTS, true),
    autoBreadcrumbs: parseBoolean(process.env.SENTRY_AUTO_BREADCRUMBS, true),
    filterLocal: parseBoolean(process.env.SENTRY_FILTER_LOCAL, true),
    sourceMaps: parseBoolean(process.env.SENTRY_SOURCEMAPS, false),
  };

  const pluginConfig = Object.assign({}, defaultPluginConfig, customPluginConfig) as PluginConfig;
  if (!pluginConfig.sentryClient) {
    pluginConfig.sentryClient = Sentry;
  }

  // Install sentry (if that didn't happen already during a previous Lambda invocation)
  if (process.env.SENTRY_DSN && !isSentryInstalled) {
    installSentry(pluginConfig);
  }

  // Create a new handler function wrapping the original one and hooking
  // into all callbacks
  return (event: any, context: Context, callback?: Callback<any>) => {
    if (!isSentryInstalled) {
      // Directly invoke the original handler
      return handler(event, context, callback);
    }

    // Hook up deprecated context callbacks
    const originalCallbacks = {
      done: context.done?.bind(context),
      succeed: context.succeed?.bind(context),
      fail: context.fail?.bind(context),
      callback,
    };
    context.done =
      typeof originalCallbacks.done === "function"
        ? wrapCallback(pluginConfig, originalCallbacks.done)
        : originalCallbacks.done;
    context.fail =
      typeof originalCallbacks.fail === "function"
        ? wrapCallback(pluginConfig, originalCallbacks.fail)
        : originalCallbacks.fail;
    context.succeed =
      typeof originalCallbacks.succeed === "function"
        ? wrapCallback(pluginConfig, (err, result) => originalCallbacks.succeed(result)).bind(null, null)
        : originalCallbacks.succeed;
    callback = originalCallbacks.callback
      ? wrapCallback(pluginConfig, originalCallbacks.callback)
      : originalCallbacks.callback;

    // Additional context to be stored with Sentry events and messages
    const sentryScope: PluginConfig["scope"] = {
      extras: {
        Event: event,
        Context: context,
      },
      tags: {},
    };

    // Depending on the endpoint type the identity information can be at
    // event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
    const identity =
      context.identity?.constructor === Object && Object.keys(context.identity).length > 0
        ? context.identity
        : event.requestContext
        ? event.requestContext.identity
        : null;

    if (identity) {
      // Track the caller's Cognito identity
      // id, username and ip_address are key fields in Sentry
      sentryScope.user = {
        id: identity.cognitoIdentityId || undefined,
        username: identity.user || undefined,
        ip_address: identity.sourceIp || undefined,
        cognito_identity_pool_id: identity.cognitoIdentityPoolId,
        cognito_authentication_type: identity.cognitoAuthenticationType,
        user_agent: identity.userAgent,
      };
    }

    // Add additional tags for AWS_PROXY endpoints
    if (event.requestContext) {
      sentryScope.tags = {
        ...sentryScope.tags,
        api_id: event.requestContext.apiId,
        api_stage: event.requestContext.stage,
        http_method: event.requestContext.httpMethod,
      };
    }

    // Callback triggered after logging unhandled exceptions or rejections.
    // We rethrow the previous error to force stop the current Lambda execution.
    const captureUnhandled = wrapCallback(pluginConfig, (err: Error) => {
      (err as any)._sentryHandled = true; // prevent recursion
      throw err;
    });

    const Sentry = pluginConfig.sentryClient;
    Sentry.configureScope((scope) => {
      sentryScope.user && scope.setUser(sentryScope.user);
      sentryScope.extras && scope.setExtras(sentryScope.extras);
      sentryScope.tags && scope.setTags(sentryScope.tags);
    });
    // Monitor for timeouts and memory usage
    // The timers will be removed in the wrappedCtx and wrappedCb below
    installTimers(pluginConfig, context);

    try {
      // This code runs within a sentry context now. Unhandled exceptions will
      // automatically be captured and reported.

      if (pluginConfig.autoBreadcrumbs) {
        // First breadcrumb is the invocation of the Lambda itself
        const breadcrumb: Sentry.Breadcrumb = {
          message: process.env.AWS_LAMBDA_FUNCTION_NAME,
          category: "lambda",
          level: "info" as Sentry.Severity,
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
        const sentryClient = pluginConfig.sentryClient;
        sentryClient.addBreadcrumb(breadcrumb);
      }

      // And finally invoke the original handler code
      const promise = handler(event, context, callback);
      if (promise && typeof promise.then === "function") {
        // don't forget to stop timers
        return promise
          .then((...data) => {
            clearTimers();
            return Promise.resolve(...data); // eslint-disable-line promise/no-return-wrap
          })
          .catch((err) => {
            clearTimers();
            return Promise.reject(err); // eslint-disable-line promise/no-return-wrap
          });
      }
      // Returning non-Promise values would be meaningless for lambda.
      // But inherit the behavior of the original handler.
      return promise;
    } catch (err) {
      // Catch and log synchronous exceptions thrown by the handler
      captureUnhandled(err);
    }
  };
}

export default withSentry;
