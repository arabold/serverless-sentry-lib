/**
 * Sentry SDK helper for AWS Lambda.
 */
"use strict";

/**
 * Whether Sentry was installed or not
 * @type {boolean}
 */
let sentryInstalled = false;

/**
 * Assorted Helper Functions loosely mimicking [lodash](https://lodash.com/).
 */
class _ {
	static extend(origin, add) {
		// Don't do anything if add isn't an object
		if (!add || !_.isObject(add)) {
			return origin;
		}

		const keys = Object.keys(add);
		let i = keys.length;
		while (i--) {
			origin[keys[i]] = add[keys[i]];
		}
		return origin;
	}

	static isObject(obj) {
		return typeof obj === "object";
	}

	static isError(obj) {
		return obj instanceof Error;
	}

	static isUndefined(obj) {
		return typeof obj === "undefined";
	}

	static isFunction(obj) {
		return typeof obj === "function";
	}

	static isNil(obj) {
		return obj === null || _.isUndefined(obj);
	}

	static get(obj, prop, defaultValue) {
		return obj.hasOwnProperty(prop) ? obj[prop] : defaultValue;
	}
}

/**
 * Install Sentry support
 *
 * @param {Object} pluginConfig - Plugin configuration. This is NOT optional!
 * @returns {undefined}
 */
function installSentry(pluginConfig) {
	const Sentry = pluginConfig.sentryClient;
	if (!Sentry) {
		console.error("Sentry client not found.");
	}

	// Check for local environment
	const isLocalEnv =
		process.env.IS_OFFLINE ||
		process.env.IS_LOCAL ||
		!process.env.LAMBDA_TASK_ROOT;
	if (pluginConfig.filterLocal && isLocalEnv) {
		// Running locally.
		console.warn("Sentry disabled in local environment");
		delete process.env.SENTRY_DSN; // otherwise sentry will start reporting nonetheless

		Sentry.init({ dsn: "" });

		sentryInstalled = true;
		return;
	}

	// add integration to fix Sourcemap path
	if (pluginConfig.sourceMaps) {
		const RewriteFramesExists =
			pluginConfig.init &&
			typeof pluginConfig.init.integrations === "array" &&
			pluginConfig.init.integrations.find(
				integration => integration.name === "RewriteFrames"
			);
		if (!RewriteFramesExists) {
			if (typeof pluginConfig.init.integrations !== "array")
				pluginConfig.init.integrations = [];

			const { RewriteFrames } = require("@sentry/integrations");
			const path = require("path");
			pluginConfig.init.integrations.push(
				new RewriteFrames({
					iteratee: frame => {
						console.log(frame.filename);
						if (
							frame.filename.startsWith("/") &&
							!frame.filename.includes("/node_modules/")
						) {
							frame.filename = "app:///" + path.basename(frame.filename);
						}
						return frame;
					}
				})
			);
		}
	}

	// We're merging the plugin config options with the Sentry options. This
	// allows us to control all aspects of Sentry in a single location -
	// our plugin configuration.
	Sentry.init(
		_.extend(
			{
				dsn: process.env.SENTRY_DSN,
				release: process.env.SENTRY_RELEASE,
				environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT
			},
			pluginConfig.init
		)
	);
	let tags = {
		lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
		version: process.env.AWS_LAMBDA_FUNCTION_VERSION,
		memory_size: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
		log_group: process.env.AWS_LAMBDA_LOG_GROUP_NAME,
		log_stream: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
		region: process.env.SERVERLESS_REGION || process.env.AWS_REGION
	};

	if (process.env.SERVERLESS_SERVICE)
		tags.service_name = process.env.SERVERLESS_SERVICE;
	if (process.env.SERVERLESS_STAGE) tags.stage = process.env.SERVERLESS_STAGE;
	if (process.env.SERVERLESS_ALIAS) tags.alias = process.env.SERVERLESS_ALIAS;

	Sentry.configureScope(scope => {
		scope.setTags(_.extend(tags, pluginConfig.scope.tags));
	});

	sentryInstalled = true;

	console.log("Sentry installed.");
}

// Timers
let memoryWatch, timeoutWarning, timeoutError;

/**
 * Insatll Watchdog timers
 *
 * @param {Object} pluginConfig
 * @param {Object} lambdaContext
 */
function installTimers(pluginConfig, lambdaContext) {
	const timeRemaining = lambdaContext.getRemainingTimeInMillis();
	const memoryLimit = lambdaContext.memoryLimitInMB;

	function timeoutWarningFunc(cb) {
		const Sentry = pluginConfig.sentryClient;
		if (sentryInstalled) {
			Sentry.withScope(scope => {
				scope.setLevel("warning");
				scope.setExtras({
					TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis()
				});
				Sentry.captureMessage("Function Execution Time Warning");
			});
			const client = Sentry.getCurrentHub().getClient();
			if (client) {
				client.flush(1000).then(function() {
					cb && cb();
				});
			} else {
				cb && cb();
			}
		}
	}

	function timeoutErrorFunc(cb) {
		const Sentry = pluginConfig.sentryClient;
		if (sentryInstalled) {
			Sentry.withScope(scope => {
				scope.setLevel("error");
				scope.setExtras({
					TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis()
				});
				Sentry.captureMessage("Function Timed Out");
			});
			const client = Sentry.getCurrentHub().getClient();
			if (client) {
				client.flush(1000).then(function() {
					cb && cb();
				});
			} else {
				cb && cb();
			}
		}
	}

	function memoryWatchFunc(cb) {
		const used = process.memoryUsage().rss / 1048576;
		const p = used / memoryLimit;
		if (p >= 0.75) {
			const Sentry = pluginConfig.sentryClient;
			if (sentryInstalled) {
				Sentry.withScope(scope => {
					scope.setLevel("warning");
					scope.setExtras({
						MemoryLimitInMB: memoryLimit,
						MemoryUsedInMB: Math.floor(used)
					});
					Sentry.captureMessage("Low Memory Warning");
				});
				const client = Sentry.getCurrentHub().getClient();
				if (client) {
					client.flush(1000).then(function() {
						cb && cb();
					});
				} else {
					cb && cb();
				}
			}
		} else {
			memoryWatch = setTimeout(memoryWatchFunc, 500);
		}
	}

	if (pluginConfig.captureTimeoutWarnings) {
		// We schedule the warning at half the maximum execution time and
		// the error a few milliseconds before the actual timeout happens.
		timeoutWarning = setTimeout(timeoutWarningFunc, timeRemaining / 2);
		timeoutError = setTimeout(
			timeoutErrorFunc,
			Math.max(timeRemaining - 500, 0)
		);
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
 * @param {Object} pluginConfig
 * @param {Function} cb - Callback function to wrap
 * @returns {Function}
 */
function wrapCallback(pluginConfig, cb) {
	return (err, data) => {
		// Stop watchdog timers
		clearTimers();

		// If an error was thrown we'll report it to Sentry
		if (err && err !== '__emptyFailParamBackCompat' && pluginConfig.captureErrors && sentryInstalled) {
			const Sentry = pluginConfig.sentryClient;
			console.log('wrapCallback',err)
			Sentry.captureException(err);
			const client = Sentry.getCurrentHub().getClient();
			if (client) {
				client.flush(1000).then(function() {
					cb(err, data);
				});
			} else {
				cb(err, data);
			}
		} else {
			cb(err, data);
		}
	};
}

/**
 * Tries to convert any given value into a boolean `true`/`false`.
 *
 * @param {any} value - Value to parse
 * @param {boolean} defaultValue - Default value to use if no valid value was passed
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue) {
	const v = String(value)
		.trim()
		.toLowerCase();
	if (["true", "t", "1", "yes", "y"].includes(v)) {
		return true;
	} else if (["false", "f", "0", "no", "n"].includes(v)) {
		return false;
	} else {
		return defaultValue;
	}
}

class SentryLambdaWrapper {
	/**
	 * Wrap a Lambda Functions Handler
	 *
	 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
	 * @param {Object|Sentry} pluginConfig - Sentry client or an options object
	 * @param {boolean} [pluginConfig.sentryClient] - Sentry client instance
	 * @param {boolean} [pluginConfig.autoBreadcrumbs] - Automatically create breadcrumbs (see Sentry SDK docs, default to `true`)
	 * @param {boolean} [pluginConfig.filterLocal] - don't report errors from local environments (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureErrors] - capture Lambda errors (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureUnhandledRejections] - capture unhandled exceptions (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureMemoryWarnings] - monitor memory usage (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureTimeoutWarnings] - monitor execution timeouts (defaults to `true`)
	 * @param {Function} handler - Original Lambda function handler
	 * @return {Function} - Wrapped Lambda function handler with Sentry instrumentation
	 */
	static handler(pluginConfig, handler) {
		if (
			_.isObject(pluginConfig) &&
			_.isFunction(pluginConfig.captureException) &&
			_.isFunction(pluginConfig.captureMessage)
		) {
			// Passed in the Sentry client object directly
			pluginConfig = { sentryClient: pluginConfig };
		}

		const pluginConfigDefaults = {
			init: {},
			scope: { tags: {}, extra: {}, user: {} },
			captureErrors: parseBoolean(
				_.get(process.env, "SENTRY_CAPTURE_ERRORS"),
				true
			),
			captureUnhandledRejections: parseBoolean(
				_.get(process.env, "SENTRY_CAPTURE_UNHANDLED"),
				true
			),
			captureMemoryWarnings: parseBoolean(
				_.get(process.env, "SENTRY_CAPTURE_MEMORY"),
				true
			),
			captureTimeoutWarnings: parseBoolean(
				_.get(process.env, "SENTRY_CAPTURE_TIMEOUTS"),
				true
			),

			autoBreadcrumbs: parseBoolean(
				_.get(process.env, "SENTRY_AUTO_BREADCRUMBS"),
				true
			),
			filterLocal: parseBoolean(
				_.get(process.env, "SENTRY_FILTER_LOCAL"),
				true
			),
			sourceMaps: parseBoolean(_.get(process.env, "SENTRY_SOURCEMAPS"), false),
			sentryClient: null
		};

		pluginConfig = _.extend(pluginConfigDefaults, pluginConfig);
		if (!pluginConfig.sentryClient) {
			pluginConfig.sentryClient = require("@sentry/node");
		}

		// Install sentry (if that didn't happen already during a previous Lambda invocation)
		if (process.env.SENTRY_DSN && !sentryInstalled) {
			installSentry(pluginConfig);
		}

		// Create a new handler function wrapping the original one and hooking
		// into all callbacks
		return (event, context, callback) => {
			if (!sentryInstalled) {
				// Directly invoke the original handler
				return handler(event, context, callback);
			}

			const originalCallbacks = {
				done: context.done.bind(context),
				succeed: context.succeed.bind(context),
				fail: context.fail.bind(context),
				callback: callback
			};
			context.done = _.isFunction(originalCallbacks.done)
				? wrapCallback(pluginConfig, originalCallbacks.done)
				: originalCallbacks.done;
			context.fail = _.isFunction(originalCallbacks.fail)
				? wrapCallback(pluginConfig, originalCallbacks.fail)
				: originalCallbacks.fail;
			context.succeed = _.isFunction(originalCallbacks.succeed)
				? wrapCallback(pluginConfig, (err, result) =>
						originalCallbacks.succeed(result)
				  ).bind(null, null)
				: originalCallbacks.succeed;
			callback = originalCallbacks.callback
				? wrapCallback(pluginConfig, originalCallbacks.callback)
				: originalCallbacks.callback;

			// Additional context to be stored with Sentry events and messages
			const sentryScope = {
				extra: {
					Event: event,
					Context: context
				},
				tags: {}
			};

			// Depending on the endpoint type the identity information can be at
			// event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
			const identity =
				!_.isNil(context.identity) &&
				context.identity.constructor === Object &&
				Object.keys(context.identity).length > 0
					? context.identity
					: !_.isNil(event.requestContext)
					? event.requestContext.identity
					: null;

			if (!_.isNil(identity)) {
				// Track the caller's Cognito identity
				// id, username and ip_address are key fields in Sentry
				sentryScope.user = {
					id: identity.cognitoIdentityId || undefined,
					username: identity.user || undefined,
					ip_address: identity.sourceIp || undefined,
					cognito_identity_pool_id: identity.cognitoIdentityPoolId,
					cognito_authentication_type: identity.cognitoAuthenticationType,
					user_agent: identity.userAgent
				};
			}

			// Add additional tags for AWS_PROXY endpoints
			if (!_.isNil(event.requestContext)) {
				_.extend(sentryScope.tags, {
					api_id: event.requestContext.apiId,
					api_stage: event.requestContext.stage,
					http_method: event.requestContext.httpMethod
				});
			}

			// Callback triggered after logging unhandled exceptions or rejections.
			// We rethrow the previous error to force stop the current Lambda execution.
			const captureUnhandled = wrapCallback(pluginConfig, err => {
				err._sentryHandled = true; // prevent recursion
				throw err;
			});

			const Sentry = pluginConfig.sentryClient;
			Sentry.configureScope(
				scope => {
					scope.setUser(sentryScope.user);
					scope.setExtras(sentryScope.extra);
					scope.setTags(sentryScope.tags);
					//scope.setContext(sentryScope);
				}
			);
			// Monitor for timeouts and memory usage
			// The timers will be removed in the wrappedCtx and wrappedCb below
			installTimers(pluginConfig, context);

			try {
				// This code runs within a sentry context now. Unhandled exceptions will
				// automatically be captured and reported.

				if (pluginConfig.autoBreadcrumbs) {
					// First breadcrumb is the invocation of the Lambda itself
					const breadcrumb = {
						message: process.env.AWS_LAMBDA_FUNCTION_NAME,
						category: "lambda",
						level: "info",
						data: {}
					};
					if (event.requestContext) {
						// Track HTTP request info as part of the breadcrumb
						_.extend(breadcrumb.data, {
							http_method:
								event.requestContext && event.requestContext.httpMethod,
							host: event.headers && event.headers.Host,
							path: event.path,
							user_agent: event.headers && event.headers["User-Agent"]
						});
					}
					const Sentry = pluginConfig.sentryClient;
					Sentry.addBreadcrumb(breadcrumb);
				}

				// And finally invoke the original handler code
				const promise = handler(event, context, callback);
				if (promise && _.isFunction(promise.then)) {
					// don't forget to stop timers
					return promise
						.then((...data) => {
							clearTimers();
							return Promise.resolve(...data);
						})
						.catch(err => {
							return Promise.reject(err)
							// clearTimers();
							// if (sentryInstalled && err && pluginConfig.captureErrors) {
							// 	const Sentry = pluginConfig.sentryClient;
							// 	console.log('handler',err)
							// 	return new Promise((resolve, reject) => {
							// 		Sentry.withScope(scope => {
							// 			//scope.setUser({ email: "john.doe@example.com" });
							// 			// scope.setTag("page_locale", "de-at");
							// 			// scope.setExtra("Event", sentryScope.extra.Event);
							// 			// scope.setExtra("Context", sentryScope.extra.Context);
							// 			// scope.setUser({
							// 			// 	username: sentryScope.user.username,
							// 			// 	user_agent: sentryScope.user.user_agent,
							// 			// 	ip_address: sentryScope.user.ip_address
							// 			// });
							// 			scope.setUser(sentryScope.user);
							// 			scope.setExtras(sentryScope.extra);
							// 			scope.setTags(sentryScope.tags);
							// 			//scope.setContext(sentryScope);
							// 			Sentry.captureException(err);
							// 		});
							// 		const client = Sentry.getCurrentHub().getClient();
							// 		if (client) {
							// 			client.flush(5000).then(function() {
							// 				reject(null);
							// 			});
							// 		}
							// 	});
							// } else {
							// 	return Promise.reject(err);
							// }
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
}

module.exports = SentryLambdaWrapper;
