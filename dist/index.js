"use strict";
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
var isSentryInstalled = false;
function installSentry(pluginConfig) {
    var _a, _b, _c;
    var sentryClient = pluginConfig.sentryClient;
    if (!sentryClient) {
        console.error("Sentry client not found.");
    }
    var isLocalEnv = process.env.IS_OFFLINE || process.env.IS_LOCAL || !process.env.LAMBDA_TASK_ROOT;
    if (pluginConfig.filterLocal && isLocalEnv) {
        console.warn("Sentry disabled in local environment");
        delete process.env.SENTRY_DSN;
        sentryClient.init({ dsn: "" });
        isSentryInstalled = true;
        return;
    }
    if (pluginConfig.sourceMaps) {
        var RewriteFramesExists = Array.isArray((_a = pluginConfig.init) === null || _a === void 0 ? void 0 : _a.integrations) && ((_b = pluginConfig.init) === null || _b === void 0 ? void 0 : _b.integrations.find(function (integration) { return integration.name === "RewriteFrames"; }));
        if (!RewriteFramesExists) {
            pluginConfig.init = (_c = pluginConfig.init) !== null && _c !== void 0 ? _c : {};
            if (!Array.isArray(pluginConfig.init.integrations)) {
                pluginConfig.init.integrations = [];
            }
            var RewriteFrames = require("@sentry/integrations").RewriteFrames;
            var path_1 = require("path");
            pluginConfig.init.integrations.push(new RewriteFrames({
                iteratee: function (frame) {
                    var _a;
                    if (((_a = frame.filename) === null || _a === void 0 ? void 0 : _a.startsWith("/")) && !frame.filename.includes("/node_modules/")) {
                        frame.filename = "app:///" + path_1.basename(frame.filename);
                    }
                    return frame;
                },
            }));
        }
    }
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
var memoryWatch;
var timeoutWarning;
var timeoutError;
function installTimers(pluginConfig, lambdaContext) {
    var timeRemaining = lambdaContext.getRemainingTimeInMillis();
    var memoryLimit = Number(lambdaContext.memoryLimitInMB);
    function timeoutWarningFunc(cb) {
        var Sentry = pluginConfig.sentryClient;
        if (isSentryInstalled) {
            Sentry.withScope(function (scope) {
                scope.setLevel("warning");
                scope.setExtras({
                    TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
                });
                Sentry.captureMessage("Function Execution Time Warning");
            });
            Sentry.flush(5000)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
    }
    function timeoutErrorFunc(cb) {
        var Sentry = pluginConfig.sentryClient;
        if (isSentryInstalled) {
            Sentry.withScope(function (scope) {
                scope.setLevel("error");
                scope.setExtras({
                    TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis(),
                });
                Sentry.captureMessage("Function Timed Out");
            });
            Sentry.flush(5000)
                .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                .catch(null);
        }
    }
    function memoryWatchFunc(cb) {
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
                Sentry_1.flush(5000)
                    .then(function () { return cb === null || cb === void 0 ? void 0 : cb(); })
                    .catch(null);
            }
        }
        else {
            memoryWatch = setTimeout(memoryWatchFunc, 500);
        }
    }
    if (pluginConfig.captureTimeoutWarnings) {
        timeoutWarning = setTimeout(timeoutWarningFunc, timeRemaining / 2);
        timeoutError = setTimeout(timeoutErrorFunc, Math.max(timeRemaining - 500, 0));
    }
    if (pluginConfig.captureMemoryWarnings) {
        memoryWatch = setTimeout(memoryWatchFunc, 500);
    }
}
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
function wrapCallback(pluginConfig, cb) {
    return function (err, data) {
        clearTimers();
        if (err && err !== "__emptyFailParamBackCompat" && pluginConfig.captureErrors && isSentryInstalled) {
            var Sentry_2 = pluginConfig.sentryClient;
            Sentry_2.captureException(err);
            Sentry_2.flush(5000)
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
function isSentryInstance(value) {
    return typeof (value === null || value === void 0 ? void 0 : value.captureException) === "function" && typeof (value === null || value === void 0 ? void 0 : value.captureMessage) === "function";
}
var SentryLambdaWrapper = (function () {
    function SentryLambdaWrapper() {
    }
    SentryLambdaWrapper.handler = function (pluginConfigOrSentry, handler) {
        var _a, _b, _c;
        var pluginConfig;
        if (isSentryInstance(pluginConfigOrSentry)) {
            pluginConfig = {
                sentryClient: pluginConfigOrSentry,
            };
        }
        else {
            pluginConfig = __assign(__assign({}, pluginConfigOrSentry), { init: __assign({}, pluginConfigOrSentry === null || pluginConfigOrSentry === void 0 ? void 0 : pluginConfigOrSentry.init), scope: __assign(__assign({}, pluginConfigOrSentry === null || pluginConfigOrSentry === void 0 ? void 0 : pluginConfigOrSentry.scope), { tags: __assign({}, (_a = pluginConfigOrSentry === null || pluginConfigOrSentry === void 0 ? void 0 : pluginConfigOrSentry.scope) === null || _a === void 0 ? void 0 : _a.tags), extras: __assign({}, (_b = pluginConfigOrSentry === null || pluginConfigOrSentry === void 0 ? void 0 : pluginConfigOrSentry.scope) === null || _b === void 0 ? void 0 : _b.extras), user: __assign({}, (_c = pluginConfigOrSentry === null || pluginConfigOrSentry === void 0 ? void 0 : pluginConfigOrSentry.scope) === null || _c === void 0 ? void 0 : _c.user) }) });
        }
        var pluginConfigDefaults = {
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
        pluginConfig = Object.assign({}, pluginConfigDefaults, pluginConfig);
        if (!pluginConfig.sentryClient) {
            pluginConfig.sentryClient = require("@sentry/node");
        }
        if (process.env.SENTRY_DSN && !isSentryInstalled) {
            installSentry(pluginConfig);
        }
        return function (event, context, callback) {
            var _a, _b, _c, _d;
            if (!isSentryInstalled) {
                return handler(event, context, callback);
            }
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
            var sentryScope = {
                extras: {
                    Event: event,
                    Context: context,
                },
                tags: {},
            };
            var identity = ((_d = context.identity) === null || _d === void 0 ? void 0 : _d.constructor) === Object && Object.keys(context.identity).length > 0
                ? context.identity
                : event.requestContext
                    ? event.requestContext.identity
                    : null;
            if (identity) {
                sentryScope.user = {
                    id: identity.cognitoIdentityId || undefined,
                    username: identity.user || undefined,
                    ip_address: identity.sourceIp || undefined,
                    cognito_identity_pool_id: identity.cognitoIdentityPoolId,
                    cognito_authentication_type: identity.cognitoAuthenticationType,
                    user_agent: identity.userAgent,
                };
            }
            if (event.requestContext) {
                sentryScope.tags = __assign(__assign({}, sentryScope.tags), { api_id: event.requestContext.apiId, api_stage: event.requestContext.stage, http_method: event.requestContext.httpMethod });
            }
            var captureUnhandled = wrapCallback(pluginConfig, function (err) {
                err._sentryHandled = true;
                throw err;
            });
            var Sentry = pluginConfig.sentryClient;
            Sentry.configureScope(function (scope) {
                sentryScope.user && scope.setUser(sentryScope.user);
                sentryScope.extras && scope.setExtras(sentryScope.extras);
                sentryScope.tags && scope.setTags(sentryScope.tags);
            });
            installTimers(pluginConfig, context);
            try {
                if (pluginConfig.autoBreadcrumbs) {
                    var breadcrumb = {
                        message: process.env.AWS_LAMBDA_FUNCTION_NAME,
                        category: "lambda",
                        level: "info",
                        data: {},
                    };
                    if (event.requestContext) {
                        breadcrumb.data = __assign(__assign({}, breadcrumb.data), { http_method: event.requestContext && event.requestContext.httpMethod, host: event.headers && event.headers.Host, path: event.path, user_agent: event.headers && event.headers["User-Agent"] });
                    }
                    var sentryClient = pluginConfig.sentryClient;
                    sentryClient.addBreadcrumb(breadcrumb);
                }
                var promise = handler(event, context, callback);
                if (promise && typeof promise.then === "function") {
                    return promise
                        .then(function () {
                        var data = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            data[_i] = arguments[_i];
                        }
                        clearTimers();
                        return Promise.resolve.apply(Promise, data);
                    })
                        .catch(function (err) {
                        clearTimers();
                        return Promise.reject(err);
                    });
                }
                return promise;
            }
            catch (err) {
                captureUnhandled(err);
            }
        };
    };
    return SentryLambdaWrapper;
}());
exports.default = SentryLambdaWrapper;
