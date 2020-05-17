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
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSentry = void 0;
var SentryLib = require("@sentry/node");
/**
 * Initialize Sentry
 *
 * @param options - Plugin configuration. This is NOT optional!
 */
function initSentry(options) {
    var _a, _b, _c;
    // Check for local environment
    var isLocalEnv = process.env.IS_OFFLINE || process.env.IS_LOCAL || !process.env.LAMBDA_TASK_ROOT;
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
                var RewriteFrames = require("@sentry/integrations").RewriteFrames;
                var path_1 = require("path");
                sentryOptions.integrations = __spreadArrays(((_c = sentryOptions.integrations) !== null && _c !== void 0 ? _c : []), [
                    new RewriteFrames({
                        iteratee: function (frame) {
                            var _a;
                            if (((_a = frame.filename) === null || _a === void 0 ? void 0 : _a.startsWith("/")) && !frame.filename.includes("/node_modules/")) {
                                frame.filename = "app:///" + path_1.basename(frame.filename);
                            }
                            return frame;
                        },
                    }),
                ]);
            }
            catch (error) {
                console.warn("Failed to initialze sourcemaps", error);
            }
        }
    }
    // We're merging the plugin config options with the Sentry options. This
    // allows us to control all aspects of Sentry in a single location -
    // our plugin configuration.
    sentryClient.init(__assign({ dsn: process.env.SENTRY_DSN, release: process.env.SENTRY_RELEASE, environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT }, sentryOptions));
    console.log("Sentry initialized.");
    return sentryClient;
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
function installTimers(sentryClient, pluginConfig, lambdaContext) {
    var timeRemaining = lambdaContext.getRemainingTimeInMillis();
    var memoryLimit = Number(lambdaContext.memoryLimitInMB);
    /** Watch for Lambdas approaching half of the defined timeout value */
    var timeoutWarningFunc = function (cb) {
        sentryClient.withScope(function (scope) {
            scope.setLevel(SentryLib.Severity.Warning);
            scope.setExtras({
                TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
            });
            sentryClient.captureMessage("Function Execution Time Warning");
        });
        sentryClient
            .flush(2000)
            .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
            .catch(null);
    };
    /** Watch for Lambdas approaching timeouts; Note that we might not have enough time to even report this anymore */
    var timeoutErrorFunc = function (cb) {
        sentryClient.withScope(function (scope) {
            scope.setLevel(SentryLib.Severity.Error);
            scope.setExtras({
                TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
            });
            sentryClient.captureMessage("Function Timed Out");
        });
        sentryClient
            .flush(2000)
            .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
            .catch(null);
    };
    /** Watch for Lambdas running out of memory */
    var memoryWatchFunc = function (cb) {
        var used = process.memoryUsage().rss / 1048576;
        var p = used / memoryLimit;
        if (p >= 0.75) {
            sentryClient.withScope(function (scope) {
                scope.setLevel(SentryLib.Severity.Warning);
                scope.setExtras({
                    MemoryLimitInMB: memoryLimit,
                    MemoryUsedInMB: Math.floor(used),
                });
                sentryClient.captureMessage("Low Memory Warning");
            });
            sentryClient
                .flush(2000)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
        else {
            // The memory watchdog is triggered twice a second
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
    var _this = this;
    var _a;
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
        scope: { tags: {}, extras: {}, user: {} }, captureErrors: parseBoolean(process.env.SENTRY_CAPTURE_ERRORS, true), captureUnhandledRejections: parseBoolean(process.env.SENTRY_CAPTURE_UNHANDLED, true), captureUncaughtException: parseBoolean(process.env.SENTRY_CAPTURE_UNCAUGHT, true), captureMemoryWarnings: parseBoolean(process.env.SENTRY_CAPTURE_MEMORY, true), captureTimeoutWarnings: parseBoolean(process.env.SENTRY_CAPTURE_TIMEOUTS, true), autoBreadcrumbs: parseBoolean(process.env.SENTRY_AUTO_BREADCRUMBS, true), filterLocal: parseBoolean(process.env.SENTRY_FILTER_LOCAL, true), sourceMaps: parseBoolean(process.env.SENTRY_SOURCEMAPS, false) }, customOptions);
    // Install sentry
    var sentryClient = (_a = customSentryClient !== null && customSentryClient !== void 0 ? customSentryClient : options.sentry) !== null && _a !== void 0 ? _a : initSentry(options);
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
            additionalScope.user = {
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
            additionalScope.tags = __assign(__assign({}, additionalScope.tags), { api_id: event.requestContext.apiId, api_stage: event.requestContext.stage, http_method: event.requestContext.httpMethod });
        }
        sentryClient.configureScope(function (scope) {
            additionalScope.user && scope.setUser(additionalScope.user);
            additionalScope.extras && scope.setExtras(additionalScope.extras);
            additionalScope.tags && scope.setTags(additionalScope.tags);
        });
        // Monitor for timeouts and memory usage
        // The timers will be removed in the wrappedCtx and wrappedCb below
        installTimers(sentryClient, options, context);
        var unhandledRejectionListener = function (err, p) {
            sentryClient.withScope(function (scope) {
                scope.setLevel(SentryLib.Severity.Error);
                scope.setExtras({
                    Error: err,
                    Promise: p,
                });
                sentryClient.captureMessage("Unhandled Promise Rejection - " + err);
            });
        };
        if (options.captureUnhandledRejections) {
            // Enable capturing of unhandled rejections
            process.on("unhandledRejection", unhandledRejectionListener);
        }
        var uncaughtExceptionListener = function (err) {
            sentryClient.withScope(function (scope) {
                scope.setLevel(SentryLib.Severity.Fatal);
                sentryClient.captureException(err);
                // Now exit the process; there is no recovery from this
                sentryClient
                    .close(2000)
                    .then(function () { return process.exit(1); })
                    .catch(function () { return process.exit(1); });
            });
        };
        if (options.captureUncaughtException) {
            // Enable capturing of uncaught exceptions
            process.removeAllListeners("uncaughtException"); // there can be only one
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
                        return [4 /*yield*/, sentryClient.close(2000)];
                    case 1:
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
                level: SentryLib.Severity.Info,
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
                .finally(function () { return callback(err, data); })
                .catch(null);
        });
        if (!callbackCalled && typeof response === "object" && typeof response.then === "function") {
            // The handler returned a promise instead of invoking the callback function
            return (function () { return __awaiter(_this, void 0, void 0, function () {
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
            }); })();
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
module.exports.default = withSentry;
