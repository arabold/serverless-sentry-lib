"use strict";
/* eslint-disable promise/no-promise-in-callback, promise/no-callback-in-promise */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var Sentry = require("@sentry/node");
/**
 * Whether Sentry is installed or not
 * @type {boolean}
 */
var isSentryInstalled = false;
/**
 * Install Sentry support
 *
 * @param pluginConfig - Plugin configuration. This is NOT optional!
 */
function installSentry(pluginConfig) {
    var _a, _b, _c;
    var sentryClient = pluginConfig.sentryClient;
    if (!sentryClient) {
        console.error("Sentry client not found.");
    }
    // Check for local environment
    var isLocalEnv = process.env.IS_OFFLINE || process.env.IS_LOCAL || !process.env.LAMBDA_TASK_ROOT;
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
        var RewriteFramesExists = Array.isArray((_a = pluginConfig.init) === null || _a === void 0 ? void 0 : _a.integrations) && ((_b = pluginConfig.init) === null || _b === void 0 ? void 0 : _b.integrations.find(function (integration) { return integration.name === "RewriteFrames"; }));
        if (!RewriteFramesExists) {
            pluginConfig.init = (_c = pluginConfig.init) !== null && _c !== void 0 ? _c : {};
            if (!Array.isArray(pluginConfig.init.integrations)) {
                pluginConfig.init.integrations = [];
            }
            try {
                var RewriteFrames = require("@sentry/integrations").RewriteFrames;
                var path_1 = require("path");
                pluginConfig.init.integrations.push(new RewriteFrames({
                    iteratee: function (frame) {
                        var _a;
                        //console.log(frame.filename);
                        if (((_a = frame.filename) === null || _a === void 0 ? void 0 : _a.startsWith("/")) && !frame.filename.includes("/node_modules/")) {
                            frame.filename = "app:///" + path_1.basename(frame.filename);
                        }
                        return frame;
                    },
                }));
            }
            catch (error) {
                pluginConfig.sourceMaps = false;
            }
        }
    }
    // We're merging the plugin config options with the Sentry options. This
    // allows us to control all aspects of Sentry in a single location -
    // our plugin configuration.
    sentryClient.init(__assign({ dsn: process.env.SENTRY_DSN, release: process.env.SENTRY_RELEASE, environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT }, pluginConfig.init));
    var tags = {
        lambda: String(process.env.AWS_LAMBDA_FUNCTION_NAME),
        version: String(process.env.AWS_LAMBDA_FUNCTION_VERSION),
        memory_size: String(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
        log_group: String(process.env.AWS_LAMBDA_LOG_GROUP_NAME),
        log_stream: String(process.env.AWS_LAMBDA_LOG_STREAM_NAME),
        region: String(process.env.SERVERLESS_REGION || process.env.AWS_REGION),
    };
    if (process.env.SERVERLESS_SERVICE)
        tags.service_name = process.env.SERVERLESS_SERVICE;
    if (process.env.SERVERLESS_STAGE)
        tags.stage = process.env.SERVERLESS_STAGE;
    if (process.env.SERVERLESS_ALIAS)
        tags.alias = process.env.SERVERLESS_ALIAS;
    sentryClient.configureScope(function (scope) {
        var _a;
        scope.setTags(__assign(__assign({}, tags), (_a = pluginConfig.scope) === null || _a === void 0 ? void 0 : _a.tags));
    });
    isSentryInstalled = true;
    console.log("Sentry installed.");
}
// Timers
/** Watch memory usage */
var memoryWatch;
/** Warn if we're about to reach the timeout */
var timeoutWarning;
/** Error if timeout is reached */
var timeoutError;
/**
 * Install Watchdog timers
 *
 * @param pluginConfig
 * @param lambdaContext
 */
function installTimers(pluginConfig, lambdaContext) {
    var timeRemaining = lambdaContext.getRemainingTimeInMillis();
    var memoryLimit = Number(lambdaContext.memoryLimitInMB);
    var timeoutWarningFunc = function (cb) {
        var Sentry = pluginConfig.sentryClient;
        if (isSentryInstalled) {
            Sentry.withScope(function (scope) {
                scope.setLevel("warning");
                scope.setExtras({
                    TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
                });
                Sentry.captureMessage("Function Execution Time Warning");
            });
            Sentry.flush(2000)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
    };
    var timeoutErrorFunc = function (cb) {
        var Sentry = pluginConfig.sentryClient;
        if (isSentryInstalled) {
            Sentry.withScope(function (scope) {
                scope.setLevel("error");
                scope.setExtras({
                    TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
                });
                Sentry.captureMessage("Function Timed Out");
            });
            Sentry.flush(2000)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
    };
    var memoryWatchFunc = function (cb) {
        var used = process.memoryUsage().rss / 1048576;
        var p = used / memoryLimit;
        if (p >= 0.75) {
            var Sentry_1 = pluginConfig.sentryClient;
            if (isSentryInstalled) {
                Sentry_1.withScope(function (scope) {
                    scope.setLevel("warning");
                    scope.setExtras({
                        MemoryLimitInMB: memoryLimit,
                        MemoryUsedInMB: Math.floor(used),
                    });
                    Sentry_1.captureMessage("Low Memory Warning");
                });
                Sentry_1.flush(2000)
                    .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                    .catch(null);
            }
        }
        else {
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
function wrapCallback(pluginConfig, cb) {
    return function (err, data) {
        // Stop watchdog timers
        clearTimers();
        // If an error was thrown we'll report it to Sentry
        if (err && err !== "__emptyFailParamBackCompat" && pluginConfig.captureErrors && isSentryInstalled) {
            var Sentry_2 = pluginConfig.sentryClient;
            Sentry_2.captureException(err);
            // After a call to close, the current client cannot be used anymore.
            // It’s important to only call close immediately before shutting down the application.
            Sentry_2.close(2000)
                .then(function () { return cb(err); })
                .catch(null);
            return;
        }
        if (err) {
            cb(err);
        }
        else {
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
function parseBoolean(value, defaultValue) {
    var v = String(value).trim().toLowerCase();
    if (["true", "t", "1", "yes", "y"].includes(v)) {
        return true;
    }
    else if (["false", "f", "0", "no", "n"].includes(v)) {
        return false;
    }
    else {
        return defaultValue;
    }
}
/** Type Guard: Check if passed value is a Sentry instance */
function isSentryInstance(value) {
    return typeof (value === null || value === void 0 ? void 0 : value.captureException) === "function" && typeof (value === null || value === void 0 ? void 0 : value.captureMessage) === "function";
}
function withSentry(arg1, arg2) {
    var _a, _b, _c;
    var handler;
    var customPluginConfig;
    if (typeof arg1 === "function") {
        // No Sentry of config passed
        customPluginConfig = {};
        handler = arg1;
    }
    else if (isSentryInstance(arg1) && typeof arg2 === "function") {
        // Passed in the Sentry client object directly
        customPluginConfig = {
            sentryClient: arg1,
        };
        handler = arg2;
    }
    else if (!isSentryInstance(arg1) && typeof arg1 === "object" && typeof arg2 === "function") {
        // Poor man's deep clone
        customPluginConfig = __assign(__assign({}, arg1), { init: __assign({}, arg1 === null || arg1 === void 0 ? void 0 : arg1.init), scope: __assign(__assign({}, arg1 === null || arg1 === void 0 ? void 0 : arg1.scope), { tags: __assign({}, (_a = arg1 === null || arg1 === void 0 ? void 0 : arg1.scope) === null || _a === void 0 ? void 0 : _a.tags), extras: __assign({}, (_b = arg1 === null || arg1 === void 0 ? void 0 : arg1.scope) === null || _b === void 0 ? void 0 : _b.extras), user: __assign({}, (_c = arg1 === null || arg1 === void 0 ? void 0 : arg1.scope) === null || _c === void 0 ? void 0 : _c.user) }) });
        handler = arg2;
    }
    else {
        throw TypeError("Invalid args passed to withSentry");
    }
    var defaultPluginConfig = {
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
    var pluginConfig = Object.assign({}, defaultPluginConfig, customPluginConfig);
    if (!pluginConfig.sentryClient) {
        pluginConfig.sentryClient = Sentry;
    }
    // Install sentry (if that didn't happen already during a previous Lambda invocation)
    if (process.env.SENTRY_DSN && !isSentryInstalled) {
        installSentry(pluginConfig);
    }
    // Create a new handler function wrapping the original one and hooking
    // into all callbacks
    return function (event, context, callback) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!isSentryInstalled) {
            // Directly invoke the original handler
            return handler(event, context, callback);
        }
        // Hook up deprecated context callbacks
        var originalCallbacks = {
            done: (_a = context.done) === null || _a === void 0 ? void 0 : _a.bind(context),
            succeed: (_b = context.succeed) === null || _b === void 0 ? void 0 : _b.bind(context),
            fail: (_c = context.fail) === null || _c === void 0 ? void 0 : _c.bind(context),
            callback: callback,
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
                ? wrapCallback(pluginConfig, function (err, result) { return originalCallbacks.succeed(result); }).bind(null, null)
                : originalCallbacks.succeed;
        callback = originalCallbacks.callback
            ? wrapCallback(pluginConfig, originalCallbacks.callback)
            : originalCallbacks.callback;
        // Additional context to be stored with Sentry events and messages
        var sentryScope = {
            extras: {
                Event: event,
                Context: context,
            },
            tags: {},
        };
        // Depending on the endpoint type the identity information can be at
        // event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
        var identity = ((_d = context.identity) === null || _d === void 0 ? void 0 : _d.constructor) === Object && Object.keys(context.identity).length > 0
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
            sentryScope.tags = __assign(__assign({}, sentryScope.tags), { api_id: event.requestContext.apiId, api_stage: event.requestContext.stage, http_method: event.requestContext.httpMethod });
        }
        // Callback triggered after logging unhandled exceptions or rejections.
        // We rethrow the previous error to force stop the current Lambda execution.
        var captureUnhandled = wrapCallback(pluginConfig, function (err) {
            err._sentryHandled = true; // prevent recursion
            throw err;
        });
        var Sentry = pluginConfig.sentryClient;
        Sentry.configureScope(function (scope) {
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
                var breadcrumb = {
                    message: process.env.AWS_LAMBDA_FUNCTION_NAME,
                    category: "lambda",
                    level: "info",
                    data: {},
                };
                if (event.requestContext) {
                    // Track HTTP request info as part of the breadcrumb
                    breadcrumb.data = __assign(__assign({}, breadcrumb.data), { http_method: (_e = event.requestContext) === null || _e === void 0 ? void 0 : _e.httpMethod, host: (_f = event.headers) === null || _f === void 0 ? void 0 : _f.Host, path: event.path, user_agent: (_g = event.headers) === null || _g === void 0 ? void 0 : _g["User-Agent"] });
                }
                var sentryClient = pluginConfig.sentryClient;
                sentryClient.addBreadcrumb(breadcrumb);
            }
            // And finally invoke the original handler code
            var promise = handler(event, context, callback);
            if (promise && typeof promise.then === "function") {
                // don't forget to stop timers
                return promise
                    .then(function () {
                    var data = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        data[_i] = arguments[_i];
                    }
                    clearTimers();
                    // eslint-disable-next-line promise/no-nesting
                    return Sentry.close(2000).then(function () { return Promise.resolve.apply(Promise, data); });
                })
                    .catch(function (err) {
                    clearTimers();
                    // eslint-disable-next-line promise/no-nesting
                    return Sentry.close(2000).then(function () { return Promise.reject(err); });
                });
            }
            else {
                // Returning non-Promise values would be meaningless for lambda.
                // But inherit the behavior of the original handler.
                return promise;
            }
        }
        catch (err) {
            // Catch and log synchronous exceptions thrown by the handler
            captureUnhandled(err);
        }
    };
}
exports.withSentry = withSentry;
exports.default = withSentry;
