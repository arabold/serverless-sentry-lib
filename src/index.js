/**
 * Raven SDK helper for AWS Lambda.
 */
"use strict";

/**
 * Whether Raven was installed or not
 * @type {boolean}
 */
let ravenInstalled = false;

/**
 * Global variable for backward compatibility with old versions of this plugin.
 *
 * This should not be used. Import Raven yourself and use the local
 * instead instead.
 *
 * @type {Raven}
 *
 * @example
 * const Raven = require('raven');
 * Raven.captureException(new Error("My Error"));
 */
global.sls_raven = null;

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
		return (typeof obj === "object");
	}

	static isError(obj) {
		return (obj instanceof Error);
	}

	static isUndefined(obj) {
		return (typeof obj === "undefined");
	}

	static isFunction(obj) {
		return (typeof obj === "function");
	}

	static isNil(obj) {
		return (obj === null || _.isUndefined(obj));
	}

	static get(obj, prop, defaultValue) {
		return obj.hasOwnProperty(prop) ? obj[prop] : defaultValue;
	}
}


/**
 * Install Raven/Sentry support
 *
 * @param {Object} pluginConfig - Plugin configuration. This is NOT optional!
 * @returns {undefined}
 */
function installRaven(pluginConfig) {
	const Raven = pluginConfig.ravenClient;
	if (!Raven) {
		console.error("Raven client not found.");
	}

	// Check for local environment
	const isLocalEnv = process.env.IS_OFFLINE || process.env.IS_LOCAL || !process.env.LAMBDA_TASK_ROOT;
	if (pluginConfig.filterLocal && isLocalEnv) {
		// Running locally.
		console.warn("Sentry disabled in local environment");
		delete process.env.SENTRY_DSN; // otherwise raven will start reporting nonetheless

		Raven.config().install();

		ravenInstalled = true;
		return;
	}

	// We're merging the plugin config options with the Raven options. This
	// allows us to control all aspects of Raven in a single location -
	// our plugin configuration.
	Raven.config(
		process.env.SENTRY_DSN,
		_.extend({
			release: process.env.SENTRY_RELEASE,
			environment: isLocalEnv ? "Local" : process.env.SENTRY_ENVIRONMENT,
			tags: {
				lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
				version: process.env.AWS_LAMBDA_FUNCTION_VERSION,
				memory_size: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
				log_group: process.env.AWS_LAMBDA_LOG_GROUP_NAME,
				log_stream: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
				service_name: process.env.SERVERLESS_SERVICE,
				stage: process.env.SERVERLESS_STAGE,
				alias: process.env.SERVERLESS_ALIAS,
				region: process.env.SERVERLESS_REGION || process.env.AWS_REGION
			}
		}, pluginConfig)
	).install();

	// Register this instance globally for backward compatibility
	// with serverless-sentry-plugin 0.2.x/0.3.x
	global.sls_raven = Raven;
	ravenInstalled = true;

	console.log("Raven installed.");
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
		const Raven = pluginConfig.ravenClient;
		ravenInstalled && Raven.captureMessage("Function Execution Time Warning", {
			level: "warning",
			extra: {
				TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis()
			}
		}, cb);
	}

	function timeoutErrorFunc(cb) {
		const Raven = pluginConfig.ravenClient;
		ravenInstalled && Raven.captureMessage("Function Timed Out", {
			level: "error",
			extra: {
				TimeRemainingInMsec: lambdaContext.getRemainingTimeInMillis()
			}
		}, cb);
	}

	function memoryWatchFunc(cb) {
		const used = process.memoryUsage().rss / 1048576;
		const p = (used / memoryLimit);
		if (p >= 0.75) {
			const Raven = pluginConfig.ravenClient;
			ravenInstalled && Raven.captureMessage("Low Memory Warning", {
				level: "warning",
				extra: {
					MemoryLimitInMB: memoryLimit,
					MemoryUsedInMB: Math.floor(used)
				}
			}, cb);

			if (memoryWatch) {
				clearTimeout(memoryWatch);
				memoryWatch = null;
			}
		}
		else {
			memoryWatch = setTimeout(memoryWatchFunc, 500);
		}
	}

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
 * @param {Object} pluginConfig
 * @param {Function} cb - Callback function to wrap
 * @returns {Function}
 */
function wrapCallback(pluginConfig, cb) {
	return (err, data) => {
		// Stop watchdog timers
		clearTimers();

		// If an error was thrown we'll report it to Sentry
		if (err && pluginConfig.captureErrors) {
			const Raven = pluginConfig.ravenClient;
			ravenInstalled && Raven.captureException(err, {}, () => {
				cb(err, data);
			});
		}
		else {
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
	const v = String(value).trim().toLowerCase();
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


class RavenLambdaWrapper {

	/**
	 * Wrap a Lambda Functions Handler
	 *
	 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
	 * @param {Object|Raven} pluginConfig - Raven client or an options object
	 * @param {boolean} [pluginConfig.ravenClient] - Raven client instance
	 * @param {boolean} [pluginConfig.autoBreadcrumbs] - Automatically create breadcrumbs (see Sentry Raven docs, default to `true`)
	 * @param {boolean} [pluginConfig.filterLocal] - don't report errors from local environments (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureErrors] - capture Lambda errors (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureUnhandledRejections] - capture unhandled exceptions (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureMemoryWarnings] - monitor memory usage (defaults to `true`)
	 * @param {boolean} [pluginConfig.captureTimeoutWarnings] - monitor execution timeouts (defaults to `true`)
	 * @param {boolean} [pluginConfig.filterEventsFields] - filter out list of fields from the event data (defaults to ''.Example for not empty:'body,headers')
	 * @param {boolean} [pluginConfig.printEventToStdout] - print the event with console log (defaults to `[]`)
	 * @param {Function} handler - Original Lambda function handler
	 * @return {Function} - Wrapped Lambda function handler with Sentry instrumentation
	 */
	static handler(pluginConfig, handler) {
		if (_.isObject(pluginConfig) &&
			_.isFunction(pluginConfig.captureException) &&
			_.isFunction(pluginConfig.captureMessage)) {
			// Passed in the Raven client object directly
			pluginConfig = { ravenClient: pluginConfig };
		}

		const pluginConfigDefaults = {
			autoBreadcrumbs: parseBoolean(_.get(process.env, "SENTRY_AUTO_BREADCRUMBS"), true),
			filterLocal: parseBoolean(_.get(process.env, "SENTRY_FILTER_LOCAL"), true),
			captureErrors: parseBoolean(_.get(process.env, "SENTRY_CAPTURE_ERRORS"), true),
			captureUnhandledRejections: parseBoolean(_.get(process.env, "SENTRY_CAPTURE_UNHANDLED"), true),
			captureMemoryWarnings: parseBoolean(_.get(process.env, "SENTRY_CAPTURE_MEMORY"), true),
			captureTimeoutWarnings: parseBoolean(_.get(process.env, "SENTRY_CAPTURE_TIMEOUTS"), true),
			filterEventsFields: _.get(process.env, "SENTRY_FILTER_EVENT_FIELDS",""),
			printEventToStdout: parseBoolean(_.get(process.env, "SENTRY_PRINT_EVENT_TO_STDOUT"), false),
			ravenClient: null
		};

		pluginConfig = _.extend(pluginConfigDefaults, pluginConfig);
		if (!pluginConfig.ravenClient) {
			pluginConfig.ravenClient = require("raven");
		}

		// Install raven (if that didn't happen already during a previous Lambda invocation)
		if (process.env.SENTRY_DSN && !ravenInstalled) {
			installRaven(pluginConfig);
		}

		// Create a new handler function wrapping the original one and hooking
		// into all callbacks
		return (event, context, callback) => {

			if (!ravenInstalled) {
				// Directly invoke the original handler
				return handler(event, context, callback);
			}

			const originalCallbacks = {
				done: context.done.bind(context),
				succeed: context.succeed.bind(context),
				fail: context.fail.bind(context),
				callback: callback,
			};
			context.done = _.isFunction(originalCallbacks.done) ?
				wrapCallback(pluginConfig, originalCallbacks.done) : originalCallbacks.done;
			context.fail = _.isFunction(originalCallbacks.fail) ?
				wrapCallback(pluginConfig, originalCallbacks.fail) : originalCallbacks.fail;
			context.succeed = _.isFunction(originalCallbacks.succeed) ?
				wrapCallback(pluginConfig, (err, result) => originalCallbacks.succeed(result)).bind(null, null) : originalCallbacks.succeed;
			callback = originalCallbacks.callback ?
				wrapCallback(pluginConfig, originalCallbacks.callback) : originalCallbacks.callback;

			// filter out no needed fields from event
			const filterEventsFieldsArray = pluginConfig.filterEventsFields.split(",");
			const eventForAdditionalContext = JSON.parse(JSON.stringify(event));
			filterEventsFieldsArray.forEach(field => {
				if (eventForAdditionalContext[field.trim()]) {
					delete eventForAdditionalContext[field.trim()]
				}
			});

			// Additional context to be stored with Raven events and messages
			const ravenContext = {
				extra: {
					Event: eventForAdditionalContext,
					Context: context
				},
				tags: {}
			};

			// Depending on the endpoint type the identity information can be at
			// event.requestContext.identity (AWS_PROXY) or at context.identity (AWS)
			const identity =
				!_.isNil(context.identity) ? context.identity :
					(!_.isNil(event.requestContext) ? event.requestContext.identity : null);

			if (!_.isNil(identity)) {
				// Track the caller's Cognito identity
				// id, username and ip_address are key fields in Sentry
				ravenContext.user = {
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
				_.extend(ravenContext.tags, {
					api_id: event.requestContext.apiId,
					api_stage: event.requestContext.stage,
					http_method: event.requestContext.httpMethod
				});
			}

			// Callback triggered after logging unhandled exceptions or rejections.
			// We rethrow the previous error to force stop the current Lambda execution.
			const captureUnhandled = wrapCallback(pluginConfig, err => {
				err._ravenHandled = true; // prevent recursion
				throw err;
			});

			const Raven = pluginConfig.ravenClient;
			return Raven.context(ravenContext, () => {
				// This code runs within a raven context now. Unhandled exceptions will
				// automatically be captured and reported.

				// Monitor for timeouts and memory usage
				// The timers will be removed in the wrappedCtx and wrappedCb below
				installTimers(pluginConfig, context);

				try {
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
								http_method: event.requestContext && event.requestContext.httpMethod,
								host: event.headers && event.headers.Host,
								path: event.path,
								user_agent: event.headers && event.headers["User-Agent"]
							});
						}
						Raven.captureBreadcrumb(breadcrumb);
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
								clearTimers();
								if (pluginConfig.printEventToStdout) {
									console.log("Processing event:", event);
								}
								if (ravenInstalled && err && pluginConfig.captureErrors) {
									const Raven = pluginConfig.ravenClient;
									return new Promise((resolve, reject) => Raven.captureException(err, {}, () => {

										reject(err);
									}));
								}
								else {
									return Promise.reject(err);
								}
							});
					}
					// Returning non-Promise values would be meaningless for lambda.
					// But inherit the behavior of the original handler.
					return promise;
				}
				catch (err) {
					// Catch and log synchronous exceptions thrown by the handler
					captureUnhandled(err);
				}
			}, err => {
				// Catch unhandled exceptions and rejections
				if (!_.isObject(err) || err._ravenHandled) {
					// This error is being rethrown. Pass it through...
					throw err;
				}
				else {
					captureUnhandled(err);
				}
			});
		};
	}
}

module.exports = RavenLambdaWrapper;
