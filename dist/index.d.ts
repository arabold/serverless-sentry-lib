import * as Sentry from "@sentry/node";
import { Callback, Context } from "aws-lambda";
export declare type Handler<TEvent = any, TResult = any> = (event: TEvent, context: Context, callback?: Callback<TResult>) => void | Promise<TResult>;
export declare type PluginConfig = {
    filterLocal?: boolean;
    sourceMaps?: boolean;
    autoBreadcrumbs?: boolean;
    captureErrors?: boolean;
    captureUnhandledRejections?: boolean;
    captureMemoryWarnings?: boolean;
    captureTimeoutWarnings?: boolean;
    init?: Sentry.NodeOptions;
    scope?: {
        tags?: {
            [key: string]: string;
        };
        extras?: {
            [key: string]: any;
        };
        user?: Sentry.User | null;
    };
    sentryClient: typeof Sentry;
};
export default class SentryLambdaWrapper {
    static handler(pluginConfigOrSentry: PluginConfig | typeof Sentry, handler: Handler<any, any>): Handler<any, any>;
}
