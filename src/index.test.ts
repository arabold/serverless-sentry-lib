import * as Sentry from "@sentry/node";
import { Context } from "aws-lambda";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";

import withSentry from "./index";

const expect = chai.expect;
chai.use(chaiAsPromised);
chai.use(sinonChai);

const sandbox = sinon.createSandbox();

const ScopeMock = {
  setLevel: (level: Sentry.Severity) => {},
  setExtras: (extras: { [key: string]: any }) => {},
  setUser: (user: Sentry.User | null) => {},
  setTag: (key: string, value: string) => {},
  setTags: (tags: { [key: string]: string }) => {},
};

/** Mock implementation of Sentry */
const SentryMock: typeof Sentry = {
  init: () => {},
  addBreadcrumb: () => {},
  captureMessage: (message: string, level?: Sentry.Severity | undefined) => "",
  captureException: (exception: any) => "",
  configureScope: (callback: (scope: Sentry.Scope) => void) => {},
  withScope: (fn: (data: any) => void) => {
    fn(ScopeMock);
  },
  getCurrentHub: () => {
    return {
      getClient: () => ({ flush: () => Promise.resolve() }),
    } as any;
  },
  flush: () => Promise.resolve(true),
  close: () => Promise.resolve(true),
} as any;

describe("SentryLambdaWrapper", () => {
  const mockEvent = {
    foo: "bar",
  };

  const mockContext: Context = {
    getRemainingTimeInMillis: () => 30 * 1000,
    memoryLimitInMB: "1024",
    functionName: "test-function",
    functionVersion: "123",
    callbackWaitsForEmptyEventLoop: false,
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:helloWord:DEV",
    awsRequestId: "6bc28136-xmpl-4365-b021-0ce6b2e64ab0",
    logGroupName: "loggroup",
    logStreamName: "logstream",

    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  afterEach(() => {
    sandbox.restore();
  });

  // ------------------------------------------------------------------------

  describe("No Sentry installed", () => {
    describe("Context Succeed/Fail/Done", () => {
      it("should invoke context.succeed callback", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: Context) => {
          context.succeed({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "succeed").callsFake((result: any) => {
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.fail callback", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { fail: (err: Error) => void }) => {
          context.fail(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "fail").callsFake((err: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.done callback with result", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { done: (err: null, data: { message: string; event: any }) => void }) => {
          context.done(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler as any);
        sandbox.stub(mockContext, "done").callsFake((err: any, result: any) => {
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.done callback with error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { done: (err: Error) => void }) => {
          context.done(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "done").callsFake((err: any, result: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });
    });

    describe("Callbacks", () => {
      it("should invoke handler callback on success", (done) => {
        /** Lambda function handler */
        const handler = (
          event: any,
          context: any,
          callback: (err: null, data: { message: string; event: any }) => void,
        ) => {
          callback(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const callback = (err: any, result: any) => {
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        };
        wrappedHandler(mockEvent, mockContext, callback);
      });

      it("should invoke handler callback on error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: any, callback: (err: Error) => void) => {
          callback(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const callback = (err: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        };
        wrappedHandler(mockEvent, mockContext, callback);
      });
    });

    describe("Async/Await (Promises)", () => {
      it("should return fulfilled Promise", () => {
        /** Lambda function handler */
        const handler = (event: any, context: any) => {
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then(
          (result) => {
            expect(result).to.have.property("message").that.is.a("string");
          },
        );
      });

      it("should return rejected Promise", () => {
        /** Lambda function handler */
        const handler = (event: any, context: any) => {
          return Promise.reject(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.rejectedWith("Test Error");
      });
    });
  });

  // ------------------------------------------------------------------------

  describe("Sentry installed", () => {
    before(() => {
      process.env.SENTRY_DSN = "https://sentry.example.com";
      process.env.AWS_LAMBDA_FUNCTION_NAME = "Test-Lambda-Function";
      process.env.LAMBDA_TASK_ROOT = "/tmp/test";
    });

    describe("Context Succeed/Fail/Done", () => {
      it("should invoke context.succeed callback", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { succeed: (data: { message: string; event: any }) => void }) => {
          context.succeed({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "succeed").callsFake((result: any) => {
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.fail callback", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { fail: (err: Error) => void }) => {
          context.fail(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "fail").callsFake((err: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.done callback with result", (done) => {
        /** Lambda function handler */
        const handler = (
          event: any,
          context: { done: (error: Error | undefined, data: { message: string; event: any }) => void },
        ) => {
          context.done(undefined, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "done").callsFake((err: any, result: any) => {
          expect(err).to.be.undefined;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should invoke context.done callback with error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { done: (err: Error) => void }) => {
          context.done(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        sandbox.stub(mockContext, "done").callsFake((err: any, result: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should capture fail", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { fail: (err: Error) => void }) => {
          context.fail(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const spy = sandbox.spy(SentryMock, "captureException");
        sandbox.stub(mockContext, "fail").callsFake((err: any) => {
          expect(spy).to.be.calledOnce;
          expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });

      it("should capture context.done with error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: { done: (err: Error) => void }) => {
          context.done(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const spy = sandbox.spy(SentryMock, "captureException");
        sandbox.stub(mockContext, "done").callsFake((err: any) => {
          expect(spy).to.be.calledOnce;
          expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
          done();
        });
        wrappedHandler(mockEvent, mockContext);
      });
    });

    describe("Callbacks", () => {
      it("should invoke handler callback on success", (done) => {
        /** Lambda function handler */
        const handler = (
          event: any,
          context: any,
          callback: (err: null, data: { message: string; event: any }) => void,
        ) => {
          callback(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const callback = (err: any, result: any) => {
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        };
        wrappedHandler(mockEvent, mockContext, callback);
      });

      it("should invoke handler callback on error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: any, callback: (err: Error) => void) => {
          callback(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const callback = (err: any) => {
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        };
        wrappedHandler(mockEvent, mockContext, callback);
      });

      it("should capture error", (done) => {
        /** Lambda function handler */
        const handler = (event: any, context: any, callback: (err: Error) => void) => {
          callback(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        const spy = sandbox.spy(SentryMock, "captureException");
        const callback = (err: any) => {
          expect(spy).to.be.calledOnce;
          expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
          done();
        };
        wrappedHandler(mockEvent, mockContext, callback);
      });
    });

    describe("Async/Await (Promises)", () => {
      it("should return fulfilled Promise", () => {
        /** Lambda function handler */
        const handler = (event: any, context: any) => {
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then(
          (result) => {
            expect(result).to.have.property("message").that.is.a("string");
          },
        );
      });

      it("should return rejected Promise", () => {
        /** Lambda function handler */
        const handler = (event: any, context: any) => {
          return Promise.reject(new Error("Test Error"));
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.rejectedWith("Test Error");
      });
    });

    describe("Context", () => {
      it("should retain original context object", () => {
        const originalContext = mockContext;
        /** Lambda function handler */
        const handler = (event: any, context: any, callback: any) => {
          expect(context).to.be.equal(originalContext);
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        };

        const wrappedHandler = withSentry(SentryMock, handler);
        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled;
      });
    });

    describe("Settings", () => {
      /** Lambda function handler */
      const handler = (
        event: any,
        context: any,
        callback: (err: null, data: { message: string; event: any }) => void,
      ) => {
        callback(null, {
          message: "Go Serverless! Your function executed successfully!",
          event,
        });
      };

      describe("autoBreadcrumbs", () => {
        it("should trace Lambda function as breadcrumb", (done) => {
          const spy = sandbox.spy(SentryMock, "addBreadcrumb");
          const wrappedHandler = withSentry(SentryMock, handler);
          const callback = (err: any, result: any) => {
            expect(spy).to.be.calledOnce;
            expect(spy).to.be.calledWith({
              category: "lambda",
              message: "Test-Lambda-Function",
              data: {},
              level: "info",
            });
            done();
          };
          wrappedHandler(mockEvent, mockContext, callback);
        });
      });

      describe("filterLocal", () => {
        it("should not install Sentry when running locally if enabled", (done) => {
          // TODO:
          done();
        });
      });

      describe("captureErrors", () => {
        it("should capture errors returned by the Lambda if enabled", (done) => {
          // TODO:
          done();
        });

        it("should not capture errors returned by the Lambda if disabled", (done) => {
          // TODO:
          done();
        });
      });

      describe("captureUnhandledRejections", () => {
        it("should capture unhandled exceptions if enabled", (done) => {
          // TODO:
          done();
        });

        it("should not capture unhandled exceptions if disabled", (done) => {
          // TODO:
          done();
        });
      });

      describe("captureMemoryWarnings", () => {
        it("should warn if Lambda function is close to running out of memory", (done) => {
          done();
        });
      });

      describe("captureTimeoutWarnings", function () {
        const remainingTime = 2000;
        this.timeout(remainingTime * 2);

        /** Lambda function handler */
        const handler = (event: any, context: any) => {
          // Now wait for the timeout...
          return new Promise((resolve) => setTimeout(resolve, remainingTime + 100));
        };

        beforeEach(() => {
          const start = Date.now();
          const stubRemainingTime = sandbox
            .stub(mockContext, "getRemainingTimeInMillis")
            .callsFake(() => start + remainingTime - Date.now());
        });

        it("should warn if more than half of the originally available time has passed", () => {
          const spy = sandbox.spy(SentryMock, "captureMessage");
          const spyScopeSetLevel = sandbox.spy(ScopeMock, "setLevel");
          const spyScopeSetExtras = sandbox.spy(ScopeMock, "setExtras");
          const wrappedHandler = withSentry(SentryMock, handler);
          return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then((result) => {
            expect(spy).to.be.calledWith("Function Execution Time Warning");
            expect(spyScopeSetLevel).to.be.calledWith("warning");
            expect(spyScopeSetExtras).to.be.calledWith({
              TimeRemainingInMsec: sinon.match.number,
            });
            // The callback happens exactly at half-time
            expect(spyScopeSetExtras.firstCall.args[0].TimeRemainingInMsec)
              .to.be.lessThan(remainingTime / 2 + 1)
              .and.above(remainingTime / 2 - 100);
          });
        });

        it("should error if Lambda timeout is hit", function () {
          const spy = sandbox.spy(SentryMock, "captureMessage");
          const spyScopeSetLevel = sandbox.spy(ScopeMock, "setLevel");
          const spyScopeSetExtras = sandbox.spy(ScopeMock, "setExtras");
          const wrappedHandler = withSentry(SentryMock, handler);
          return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then((result) => {
            expect(spy).to.be.calledWith("Function Timed Out");
            expect(spyScopeSetLevel).to.be.calledWith("error");
            expect(spyScopeSetExtras).to.be.calledWith({
              TimeRemainingInMsec: sinon.match.number,
            });
            // The callback happens 500 msecs before Lambda would time out
            expect(spyScopeSetExtras.secondCall.args[0].TimeRemainingInMsec).to.be.lessThan(501).and.above(400);
          });
        });
      });
    });
  });
});
