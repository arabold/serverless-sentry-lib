"use strict";
/* eslint-disable promise/no-promise-in-callback */
/* eslint-disable promise/no-callback-in-promise */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSentry = void 0;
var path_1 = require("path");
var integrations_1 = require("@sentry/integrations");
var SentryLib = require("@sentry/node");
/**
 * Tries to convert any given value into a boolean `true`/`false`.
 *
 * @param value - Value to parse
 * @param defaultValue - Default value to use if no valid value was passed
 */
function parseBoolean(value, defaultValue) {
    if (defaultValue === void 0) { defaultValue = false; }
    var v = String(value).trim().toLowerCase();
    if (["true", "t", "1", "yes", "y", "on"].includes(v)) {
        return true;
    }
    else if (["false", "f", "0", "no", "n", "off"].includes(v)) {
        return false;
    }
    else {
        return defaultValue;
    }
}
/** Type Guard: Check if passed value is a Sentry instance */
function isSentryInstance(value) {
    return (typeof (value === null || value === void 0 ? void 0 : value.captureException) === "function" &&
        typeof (value === null || value === void 0 ? void 0 : value.captureMessage) === "function");
}
/**
 * Initialize Sentry. This function is called by `withSentry` if no custom Sentry instance is
 * passed. Do not invoke directly!
 *
 * @param options - Plugin configuration. This is NOT optional!
 */
function initSentry(options) {
    var _a, _b, _c;
    // Check for local environment
    var isLocalEnv = parseBoolean(process.env.IS_OFFLINE) || parseBoolean(process.env.IS_LOCAL) || !process.env.LAMBDA_TASK_ROOT;
    if (options.filterLocal && isLocalEnv) {
        // Running locally.
        console.warn("Sentry disabled in local environment.");
        return undefined;
    }
    if (!process.env.SENTRY_DSN && !((_a = options === null || options === void 0 ? void 0 : options.sentryOptions) === null || _a === void 0 ? void 0 : _a.dsn)) {
        // No DSN set
        console.warn("SENTRY_DSN not set. Sentry is disabled.");
        return undefined;
    }
    // No sentry client has been passed so we initialize it ourselves
    var sentryClient = SentryLib;
    var sentryOptions = __assign({}, options.sentryOptions);
    // add integration to fix Sourcemap path
    if (options.sourceMaps && typeof sentryOptions.integrations !== "function") {
        var rewriteFramesLoaded = (_b = sentryOptions.integrations) === null || _b === void 0 ? void 0 : _b.find(function (integration) { return integration.name === "RewriteFrames"; });
        if (!rewriteFramesLoaded) {
            try {
                sentryOptions.integrations = __spreadArray(__spreadArray([], ((_c = sentryOptions.integrations) !== null && _c !== void 0 ? _c : []), true), [
                    new integrations_1.RewriteFrames({
                        iteratee: function (frame) {
                            var _a;
                            if (((_a = frame.filename) === null || _a === void 0 ? void 0 : _a.startsWith("/")) && !frame.filename.includes("/node_modules/")) {
                                frame.filename = "app:///".concat(path_1.default.basename(frame.filename));
                            }
                            return frame;
                        },
                    }),
                ], false);
            }
            catch (error) {
                console.warn("Failed to initialze sourcemaps", error);
            }
        }
    }
    // We're merging the plugin config options with the Sentry options. This
    // allows us to control all aspects of Sentry in a single location -
    // our plugin configuration.
    sentryClient.init(__assign({ dsn: process.env.SENTRY_DSN, release: process.env.SENTRY_RELEASE, environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT, integrations: function (integrations) {
            // Integrations will be all default integrations. When installing our own rejection and
            // exception handlers, we want to remove the default integrations instead.
            return integrations.filter(function (integration) {
                return (!options.captureUncaughtException || integration.name !== SentryLib.Integrations.OnUncaughtException.id) &&
                    (!options.captureUnhandledRejections || integration.name !== SentryLib.Integrations.OnUnhandledRejection.id);
            });
        } }, sentryOptions));
    console.log("Sentry initialized.");
    return sentryClient;
}
// Timers
/** Watch memory usage */
var memoryWatchTimer;
/** Warn if we're about to reach the timeout */
var timeoutWarningTimer;
/** Error if timeout is reached */
var timeoutErrorTimer;
/**
 * Install Watchdog timers
 *
 * @param pluginConfig
 * @param lambdaContext
 */
function installTimers(sentryClient, pluginConfig, lambdaContext) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    var timeRemaining = lambdaContext.getRemainingTimeInMillis();
    var memoryLimit = Number(lambdaContext.memoryLimitInMB);
    var flushTimeout = (_c = (_a = pluginConfig.flushTimeout) !== null && _a !== void 0 ? _a : (_b = pluginConfig.sentryOptions) === null || _b === void 0 ? void 0 : _b.shutdownTimeout) !== null && _c !== void 0 ? _c : 2000;
    var captureTimeouts = pluginConfig.captureTimeouts === true || ((_d = pluginConfig.captureTimeouts) === null || _d === void 0 ? void 0 : _d.enabled);
    var timeoutWarningMsec = Math.floor((_f = (_e = pluginConfig.captureTimeouts) === null || _e === void 0 ? void 0 : _e.timeRemainingWarning) !== null && _f !== void 0 ? _f : timeRemaining / 2);
    var timeoutErrorMsec = Math.floor((_h = (_g = pluginConfig.captureTimeouts) === null || _g === void 0 ? void 0 : _g.timeRemainingError) !== null && _h !== void 0 ? _h : flushTimeout);
    var captureMemory = pluginConfig.captureMemory === true || ((_j = pluginConfig.captureMemory) === null || _j === void 0 ? void 0 : _j.enabled);
    var captureMemoryInterval = Math.floor((_l = (_k = pluginConfig.captureMemory) === null || _k === void 0 ? void 0 : _k.interval) !== null && _l !== void 0 ? _l : 500);
    /** Watch for Lambdas approaching half of the defined timeout value */
    var timeoutWarningFunc = function (cb) {
        sentryClient.withScope(function (scope) {
            scope.setLevel("warning");
            scope.setExtras({
                TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
            });
            sentryClient.captureMessage("Function Execution Time Warning");
        });
        sentryClient
            .flush(flushTimeout)
            .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
            .catch(null);
    };
    /** Watch for Lambdas approaching timeouts; Note that we might not have enough time to even report this anymore */
    var timeoutErrorFunc = function (cb) {
        sentryClient.withScope(function (scope) {
            scope.setLevel("error");
            scope.setExtras({
                TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
            });
            sentryClient.captureMessage("Function Timed Out");
        });
        sentryClient
            .flush(flushTimeout)
            .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
            .catch(null);
    };
    /** Watch for Lambdas running out of memory */
    var memoryWatchFunc = function (cb) {
        var used = process.memoryUsage().rss / 1048576;
        var p = used / memoryLimit;
        if (p >= 0.75) {
            sentryClient.withScope(function (scope) {
                scope.setLevel("warning");
                scope.setExtras({
                    MemoryLimitInMB: memoryLimit,
                    MemoryUsedInMB: Math.floor(used),
                });
                sentryClient.captureMessage("Low Memory Warning");
            });
            sentryClient
                .flush(flushTimeout)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
        else {
            // The memory watchdog is triggered twice a second
            memoryWatchTimer = setTimeout(memoryWatchFunc, captureMemoryInterval);
        }
    };
    if (captureTimeouts &&
        timeoutWarningMsec > 0 &&
        timeoutErrorMsec > 0 &&
        timeRemaining > timeoutWarningMsec &&
        timeRemaining > timeoutErrorMsec) {
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
function withSentry(arg1, arg2) {
    var _this = this;
    var _a, _b, _c, _d, _e;
    /** Original handler function */
    var handler;
    /** Custom Sentry client passed as function argument (optional) */
    var customSentryClient;
    /** Custom options passed as function argument */
    var customOptions;
    if (typeof arg1 === "function") {
        // No Sentry of config passed
        customOptions = {};
        handler = arg1;
    }
    else if (isSentryInstance(arg1) && typeof arg2 === "function") {
        // Passed in the Sentry client object directly
        customSentryClient = arg1;
        customOptions = {};
        handler = arg2;
    }
    else if (!isSentryInstance(arg1) && typeof arg1 === "object" && typeof arg2 === "function") {
        customOptions = __assign({}, arg1);
        handler = arg2;
    }
    else {
        throw TypeError("Invalid args passed to withSentry");
    }
    var options = __assign({ 
        // Set default options
        scope: { tags: {}, extras: {}, user: {} }, captureErrors: parseBoolean(process.env.SENTRY_CAPTURE_ERRORS, true), captureUnhandledRejections: parseBoolean(process.env.SENTRY_CAPTURE_UNHANDLED, true), captureUncaughtException: parseBoolean(process.env.SENTRY_CAPTURE_UNCAUGHT, true), captureMemory: parseBoolean(process.env.SENTRY_CAPTURE_MEMORY, true), captureTimeouts: parseBoolean(process.env.SENTRY_CAPTURE_TIMEOUTS, true), autoBreadcrumbs: parseBoolean(process.env.SENTRY_AUTO_BREADCRUMBS, true), filterLocal: parseBoolean(process.env.SENTRY_FILTER_LOCAL, true), sourceMaps: parseBoolean(process.env.SENTRY_SOURCEMAPS, false) }, customOptions);
    if (typeof options.captureMemoryWarnings !== "undefined") {
        console.warn("`WithSentryOptions#captureMemoryWarnings` is deprecated. Use `captureMemory` instead!");
        options.captureMemory = (_a = options.captureMemory) !== null && _a !== void 0 ? _a : options.captureMemoryWarnings;
    }
    if (typeof options.captureTimeoutWarnings !== "undefined") {
        console.warn("`WithSentryOptions#captureTimeoutWarnings` is deprecated. Use `captureTimeouts` instead!");
        options.captureTimeouts = (_b = options.captureTimeouts) !== null && _b !== void 0 ? _b : options.captureTimeoutWarnings;
    }
    // Install sentry
    var sentryClient = (_c = customSentryClient !== null && customSentryClient !== void 0 ? customSentryClient : options.sentry) !== null && _c !== void 0 ? _c : initSentry(options);
    var flushTimeout = (_d = options.flushTimeout) !== null && _d !== void 0 ? _d : (_e = options.sentryOptions) === null || _e === void 0 ? void 0 : _e.shutdownTimeout;
    // Create a new handler function wrapping the original one and hooking into all callbacks
    return function (event, context, callback) {
        var _a, _b, _c, _d, _e;
        if (!sentryClient) {
            // Pass-through to the original handler and return
            return handler(event, context, callback);
        }
        // Additional context to be stored with Sentry events and messages
        var additionalScope = {
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
        if (process.env.SERVERLESS_SERVICE)
            additionalScope.tags.service_name = process.env.SERVERLESS_SERVICE;
        if (process.env.SERVERLESS_STAGE)
            additionalScope.tags.stage = process.env.SERVERLESS_STAGE;
        if (process.env.SERVERLESS_ALIAS)
            additionalScope.tags.alias = process.env.SERVERLESS_ALIAS;
        // Depending on the endpoint type the identity information can be at
        // event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
        var identity = ((_a = context.identity) === null || _a === void 0 ? void 0 : _a.constructor) === Object && Object.keys(context.identity).length > 0
            ? context.identity
            : (_b = event.requestContext) === null || _b === void 0 ? void 0 : _b.identity;
        if (identity) {
            // Track the caller's Cognito identity
            // id, username and ip_address are key fields in Sentry
            additionalScope.user = __assign(__assign({}, additionalScope.user), { id: identity.cognitoIdentityId || undefined, username: identity.user || undefined, ip_address: identity.sourceIp || undefined, cognito_identity_pool_id: identity.cognitoIdentityPoolId, cognito_authentication_type: identity.cognitoAuthenticationType, user_agent: identity.userAgent });
        }
        // Add additional tags for AWS_PROXY endpoints
        if (event.requestContext) {
            additionalScope.tags = __assign(__assign({}, additionalScope.tags), { api_id: event.requestContext.apiId, api_stage: event.requestContext.stage, http_method: event.requestContext.httpMethod });
        }
        sentryClient.configureScope(function (scope) {
            var _a, _b, _c;
            if (!customSentryClient) {
                // Make sure we work with a clean scope as AWS is reusing our Lambda instance if it's already warm
                scope.clear();
            }
            scope.setUser(__assign(__assign({}, additionalScope.user), (_a = options.scope) === null || _a === void 0 ? void 0 : _a.user));
            scope.setExtras(__assign(__assign({}, additionalScope.extras), (_b = options.scope) === null || _b === void 0 ? void 0 : _b.extras));
            scope.setTags(__assign(__assign({}, additionalScope.tags), (_c = options.scope) === null || _c === void 0 ? void 0 : _c.tags));
        });
        // Monitor for timeouts and memory usage
        // The timers will be removed in `finalize` function below
        installTimers(sentryClient, options, context);
        var originalRejectionListeners = [];
        var unhandledRejectionListener = function (err, p) {
            sentryClient.withScope(function (scope) {
                scope.setLevel("error");
                scope.setExtras({
                    Error: err,
                    Promise: p,
                });
                sentryClient.captureMessage("Unhandled Promise Rejection - ".concat(String(err)));
            });
            // Now invoke the original listeners so behavior remains largly unchanged
            sentryClient
                .flush(flushTimeout)
                .then(function () { return originalRejectionListeners.forEach(function (listener) { return listener(err, p); }); })
                .catch(function () { return process.exit(1); });
        };
        if (options.captureUnhandledRejections) {
            // Enable capturing of unhandled rejections
            originalRejectionListeners = process.listeners("unhandledRejection");
            process.removeAllListeners("unhandledRejection"); // remove any AWS handlers
            process.on("unhandledRejection", unhandledRejectionListener);
        }
        var originalExceptionListeners = [];
        var uncaughtExceptionListener = function (err) {
            sentryClient.withScope(function (scope) {
                scope.setLevel("fatal");
                sentryClient.captureException(err);
            });
            // Now invoke the original listeners so behavior remains largly unchanged
            sentryClient
                .flush(flushTimeout)
                .then(function () { return originalExceptionListeners.forEach(function (listener) { return listener(err, "uncaughtException"); }); })
                .catch(function () { return process.exit(1); });
        };
        if (options.captureUncaughtException) {
            // Enable capturing of uncaught exceptions
            originalExceptionListeners = process.listeners("uncaughtException");
            process.removeAllListeners("uncaughtException"); // remove any AWS handlers
            process.on("uncaughtException", uncaughtExceptionListener);
        }
        /** Finalize withSentry wrapper, flush messages and remove all listeners */
        var finalize = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        clearTimers();
                        options.captureUnhandledRejections && process.removeListener("unhandledRejection", unhandledRejectionListener);
                        options.captureUncaughtException && process.removeListener("uncaughtException", uncaughtExceptionListener);
                        if (!!customSentryClient) return [3 /*break*/, 2];
                        // Use `flush`, not `close` here as the Lambda might be kept alive and we don't want
                        // to break our Sentry instance
                        return [4 /*yield*/, sentryClient.flush(flushTimeout)];
                    case 1:
                        // Use `flush`, not `close` here as the Lambda might be kept alive and we don't want
                        // to break our Sentry instance
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        }); };
        if (options.autoBreadcrumbs) {
            // First breadcrumb is the invocation of the Lambda itself
            var breadcrumb = {
                message: process.env.AWS_LAMBDA_FUNCTION_NAME,
                category: "lambda",
                level: "info",
                data: {},
            };
            if (event.requestContext) {
                // Track HTTP request info as part of the breadcrumb
                breadcrumb.data = __assign(__assign({}, breadcrumb.data), { http_method: (_c = event.requestContext) === null || _c === void 0 ? void 0 : _c.httpMethod, host: (_d = event.headers) === null || _d === void 0 ? void 0 : _d.Host, path: event.path, user_agent: (_e = event.headers) === null || _e === void 0 ? void 0 : _e["User-Agent"] });
            }
            sentryClient.addBreadcrumb(breadcrumb);
        }
        // And finally invoke the original handler code
        var callbackCalled = false;
        var response = handler(event, context, function (err, data) {
            // We wrap the original callback here
            callbackCalled = true;
            if (err && options.captureErrors) {
                sentryClient.captureException(err);
            }
            finalize()
                .finally(function () { return callback(err, data); }) // invoke the original callback
                .catch(null);
        });
        if (!callbackCalled && typeof response === "object" && typeof response.then === "function") {
            // The handler returned a promise instead of invoking the callback function
            var resolveResponseAsync = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, 3, 5]);
                            return [4 /*yield*/, response];
                        case 1: 
                        // resolve the response
                        return [2 /*return*/, _a.sent()];
                        case 2:
                            err_1 = _a.sent();
                            // Promise rejected
                            if (options.captureErrors) {
                                sentryClient.captureException(err_1);
                            }
                            throw err_1; // continue throwing
                        case 3: 
                        // Cleanup
                        return [4 /*yield*/, finalize()];
                        case 4:
                            // Cleanup
                            _a.sent();
                            return [7 /*endfinally*/];
                        case 5: return [2 /*return*/];
                    }
                });
            }); };
            return resolveResponseAsync();
        }
        else {
            return response;
        }
    };
}
exports.withSentry = withSentry;
exports.default = withSentry;
module.exports = withSentry;
// TypeScript imports the `default` property for
// an ES2015 default import (`import test from 'ava'`)
// See: https://github.com/Microsoft/TypeScript/issues/2242#issuecomment-83694181
module.exports.default = withSentry; // eslint-disable-line @typescript-eslint/no-unsafe-member-access
