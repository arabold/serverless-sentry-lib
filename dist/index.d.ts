import * as SentryLib from "@sentry/node";
import { Callback, Context } from "aws-lambda";
/**
 * {@link Handler} context parameter.
 * See {@link https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html AWS documentation}.
 */
export declare type Handler<TEvent = any, TResult = any> = (event: TEvent, context: Context, callback: Callback<TResult>) => void | Promise<TResult>;
export declare type CaptureMemoryOptions = {
    enabled: boolean;
    /**
     * How often to check for low memory warnings (in milliseconds; defaults to 500)
     */
    interval?: number;
};
export declare type CaptureTimeoutOptions = {
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
export declare type WithSentryOptions = {
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
        tags?: {
            [key: string]: string;
        };
        extras?: {
            [key: string]: any;
        };
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
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export declare function withSentry<TEvent = any, TResult = any>(handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param pluginConfig - Plugin configuration
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export declare function withSentry<TEvent = any, TResult = any>(pluginConfig: WithSentryOptions, handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param SentryInstance - Sentry client
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export declare function withSentry<TEvent = any, TResult = any>(SentryInstance: typeof SentryLib, handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
export default withSentry;
