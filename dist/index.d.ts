import * as Sentry from "@sentry/node";
import { Callback, Context } from "aws-lambda";
/**
 * Lambda Function Handler
 */
export declare type Handler<TEvent = any, TResult = any> = (event: TEvent, context: Context, callback?: Callback<TResult>) => void | Promise<TResult>;
/**
 * Serverless Sentry Plugin Configuration
 */
export declare type PluginConfig = {
    /** Sentry client instance */
    sentryClient: typeof Sentry;
    /** Additional Sentry options */
    init?: Sentry.NodeOptions;
    /** Custom scope settings */
    scope?: {
        tags?: {
            [key: string]: string;
        };
        extras?: {
            [key: string]: any;
        };
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
export declare function withSentry<TEvent = any, TResult = any>(pluginConfig: PluginConfig, handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
/**
 * Higher Order Function to Wrap a Lambda Functions Handler
 *
 * @see http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html
 * @param SentryInstance - Sentry client
 * @param handler - Original Lambda function handler
 * @returns Wrapped Lambda function handler with Sentry instrumentation
 */
export declare function withSentry<TEvent = any, TResult = any>(SentryInstance: typeof Sentry, handler: Handler<TEvent, TResult>): Handler<TEvent, TResult>;
export default withSentry;
