import * as Sentry from "@sentry/node";
import { Callback, Context, Handler } from "aws-lambda";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as proxyquire from "proxyquire";
import Sinon, * as sinon from "sinon";
import * as sinonChai from "sinon-chai";

const expect = chai.expect;
chai.use(chaiAsPromised);
chai.use(sinonChai);

const sandbox = sinon.createSandbox();

const mockScope = {
  setLevel: sandbox.spy((level: Sentry.Severity) => {}),
  setExtras: sandbox.spy((extras: { [key: string]: any }) => {}),
  setUser: sandbox.spy((user: Sentry.User | null) => {}),
  setTag: sandbox.spy((key: string, value: string) => {}),
  setTags: sandbox.spy((tags: { [key: string]: string }) => {}),
};

/** Mock implementation of Sentry */
const mockSentry: typeof Sentry = {
  init: sandbox.stub(),
  addBreadcrumb: sandbox.stub(),
  captureMessage: sandbox.spy((message: string, level?: Sentry.Severity | undefined) => ""),
  captureException: sandbox.spy((exception: any) => ""),
  configureScope: sandbox.spy((callback: (scope: Sentry.Scope) => void) => {}),
  withScope: sandbox.spy((fn: (data: any) => void) => {
    fn(mockScope);
  }),
  getCurrentHub: sandbox.spy(() => {
    return {
      getClient: () => ({ flush: () => Promise.resolve() }),
    } as any;
  }),
  flush: sandbox.spy(() => Promise.resolve(true)),
  close: sandbox.spy(() => Promise.resolve(true)),
} as any;

// Initialize withSentry using the mocked Sentry implementation
const withSentry = proxyquire("./index", {
  "@sentry/node": mockSentry,
});

describe("withSentry", () => {
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

    done: () => {
      throw new Error("deprecated");
    },
    fail: () => {
      throw new Error("deprecated");
    },
    succeed: () => {
      throw new Error("deprecated");
    },
  };

  beforeEach(() => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "Test-Lambda-Function";
    process.env.LAMBDA_TASK_ROOT = "/tmp/test";
  });

  afterEach(() => {
    sandbox.resetHistory();
  });

  // ------------------------------------------------------------------------

  describe("Sentry DSN not set", () => {
    before(() => {
      delete process.env.SENTRY_DSN;
      process.env.SENTRY_FILTER_LOCAL = "false";
    });

    after(() => {
      delete process.env.SENTRY_DSN;
      delete process.env.SENTRY_FILTER_LOCAL;
    });

    describe("Callbacks", () => {
      it("should invoke callback with result", (done) => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any, callback: Callback<any>) => {
          callback(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.not.be.called;
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
      });

      it("should invoke callback with error", (done) => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any, callback: Callback<any>) => {
          callback(new Error("Test Error"));
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.not.be.called;
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
      });
    });

    describe("Async/Await (Promises)", () => {
      it("should return fulfilled Promise", () => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any) => {
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });
        return expect(handler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then((result) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.not.be.called;
          expect(result).to.have.property("message").that.is.a("string");
        });
      });

      it("should return rejected Promise", () => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any) => {
          return Promise.reject(new Error("Test Error"));
        });
        return expect(handler(mockEvent, mockContext, sinon.stub()))
          .to.eventually.be.rejectedWith("Test Error")
          .then(() => {
            expect(mockSentry.init).to.not.be.called;
            expect(mockSentry.captureException).to.not.be.called;
          });
      });
    });
  });

  // ------------------------------------------------------------------------

  describe("Sentry DSN set", () => {
    before(() => {
      process.env.SENTRY_DSN = "https://sentry.example.com";
      process.env.SENTRY_FILTER_LOCAL = "false";
    });

    after(() => {
      delete process.env.SENTRY_DSN;
      delete process.env.SENTRY_FILTER_LOCAL;
    });

    describe("Callbacks", () => {
      it("should invoke callback with result", (done) => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any, callback: Callback<any>) => {
          callback(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(mockSentry.captureException).to.not.be.called;
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
      });

      it("should invoke callback with error", (done) => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any, callback: Callback<any>) => {
          callback(new Error("Test Error"));
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(mockSentry.captureException).to.be.calledOnce;
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
      });
    });

    describe("Async/Await (Promises)", () => {
      it("should return fulfilled Promise", () => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any) => {
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });
        return expect(handler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then((result) => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(mockSentry.captureException).to.not.be.called;
          expect(result).to.have.property("message").that.is.a("string");
        });
      });

      it("should return rejected Promise", () => {
        /** Lambda function handler */
        const handler = withSentry((event: any, context: any) => {
          return Promise.reject(new Error("Test Error"));
        });
        return expect(handler(mockEvent, mockContext, sinon.stub()))
          .to.eventually.be.rejectedWith("Test Error")
          .then(() => {
            expect(mockSentry.init).to.be.calledOnce;
            expect(mockSentry.captureException).to.be.calledOnce;
          });
      });
    });
  });

  // ------------------------------------------------------------------------

  describe("Custom Sentry Instance", () => {
    describe("Callbacks", () => {
      it("should invoke callback with result", (done) => {
        /** Lambda function handler */
        const handler = withSentry(mockSentry, (event: any, context: any, callback: Callback<any>) => {
          callback(null, {
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.not.be.called;
          expect(err).to.be.null;
          expect(result).to.have.property("message").that.is.a("string");
          done();
        });
      });

      it("should invoke callback with error", (done) => {
        /** Lambda function handler */
        const handler = withSentry(mockSentry, (event: any, context: any, callback: Callback<any>) => {
          callback(new Error("Test Error"));
        });

        handler(mockEvent, mockContext, (err: Error, result: any) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.be.calledOnce;
          expect(err).to.be.an("error").with.property("message", "Test Error");
          done();
        });
      });
    });

    describe("Async/Await (Promises)", () => {
      it("should return fulfilled Promise", () => {
        /** Lambda function handler */
        const handler = withSentry(mockSentry, (event: any, context: any) => {
          return Promise.resolve({
            message: "Go Serverless! Your function executed successfully!",
            event,
          });
        });
        return expect(handler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then((result) => {
          expect(mockSentry.init).to.not.be.called;
          expect(mockSentry.captureException).to.not.be.called;
          expect(result).to.have.property("message").that.is.a("string");
        });
      });

      it("should return rejected Promise", () => {
        /** Lambda function handler */
        const handler = withSentry(mockSentry, (event: any, context: any) => {
          return Promise.reject(new Error("Test Error"));
        });
        return expect(handler(mockEvent, mockContext, sinon.stub()))
          .to.eventually.be.rejectedWith("Test Error")
          .then(() => {
            expect(mockSentry.init).to.not.be.called;
            expect(mockSentry.captureException).to.be.calledOnce;
          });
      });
    });
  });

  // ------------------------------------------------------------------------

  describe("Custom Settings", () => {
    const options = {
      sentryOptions: {
        dsn: "https://sentry.example.com",
      },
      filterLocal: false,
      sourceMaps: true,
      autoBreadcrumbs: true,
      captureErrors: true,
      captureUnhandledRejections: true,
      captureUncaughtException: true,
      captureMemoryWarnings: true,
      captureTimeoutWarnings: true,
    };

    describe("autoBreadcrumbs", () => {
      it("enabled - should trace Lambda function as breadcrumb", async () => {
        /** Lambda function handler */
        const handler = async (event: any, context: any) => {
          return "Go Serverless! Your function executed successfully!";
        };

        const wrappedHandler = withSentry({ ...options, autoBreadcrumbs: true }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(mockSentry.addBreadcrumb).to.be.calledOnce;
          expect(mockSentry.addBreadcrumb).to.be.calledWith({
            category: "lambda",
            message: "Test-Lambda-Function",
            data: {},
            level: "info",
          });
        });
      });

      it("disabled - should not trace Lambda function as breadcrumb", async () => {
        /** Lambda function handler */
        const handler = async (event: any, context: any) => {
          return "Go Serverless! Your function executed successfully!";
        };

        const wrappedHandler = withSentry({ ...options, autoBreadcrumbs: false }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(mockSentry.addBreadcrumb).to.not.be.called;
        });
      });
    });

    describe("filterLocal", () => {
      afterEach(() => {
        delete process.env.IS_OFFLINE;
      });

      /** Lambda function handler */
      const handler = async (event: any, context: any) => {
        return "Go Serverless! Your function executed successfully!";
      };

      it("enabled - should not initialize Sentry when running locally", async () => {
        process.env.IS_OFFLINE = "true";
        const wrappedHandler = withSentry({ ...options, filterLocal: true }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.not.be.called;
        });
      });

      it("enabled - should initialize Sentry when not running locally", async () => {
        process.env.IS_OFFLINE = "false";
        const wrappedHandler = withSentry({ ...options, filterLocal: true }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
        });
      });

      it("disabled - should initialize Sentry when running locally", async () => {
        process.env.IS_OFFLINE = "true";
        const wrappedHandler = withSentry({ ...options, filterLocal: false }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
        });
      });

      it("disabled - should initialize Sentry when not running locally", async () => {
        process.env.IS_OFFLINE = "false";
        const wrappedHandler = withSentry({ ...options, filterLocal: false }, handler);

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
        });
      });
    });

    describe("captureErrors", () => {
      /** Lambda function handler */
      const handler = async (event: any, context: any) => {
        throw new Error("Test Error");
      };

      it("enabled - should capture errors returned by the Lambda", async () => {
        const wrappedHandler = withSentry({ ...options, captureErrors: true }, handler);

        return expect(wrappedHandler(mockEvent, mockContext))
          .to.eventually.be.rejectedWith("Test Error")
          .then(() => {
            expect(mockSentry.init).to.be.calledOnce;
            expect(mockSentry.captureException).to.be.calledOnce;
          });
      });

      it("disabled - should not capture errors returned by the Lambda", async () => {
        const wrappedHandler = withSentry({ ...options, captureErrors: false }, handler);

        return expect(wrappedHandler(mockEvent, mockContext))
          .to.eventually.be.rejectedWith("Test Error")
          .then(() => {
            expect(mockSentry.init).to.be.calledOnce;
            expect(mockSentry.captureException).to.not.be.called;
          });
      });
    });

    describe("captureUnhandledRejections", () => {
      /** Lambda function handler */
      const handler = async (event: any, context: any) => {
        // new Promise((resolve, reject) => {
        //   setTimeout(() => {
        //     // Cause an unhandled exception
        //     reject(new Error("Test"));
        //   }, 100);
        // }); // we don't handle this promise, we don't return it

        return "Go Serverless! Your function executed successfully!";
      };

      it("enabled - should capture unhandled promise rejections", async () => {
        const wrappedHandler = withSentry({ ...options, captureUnhandledRejections: true }, handler);
        const spyProcessListener = sandbox.spy(process, "on");

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(spyProcessListener).to.be.calledWith("unhandledRejection", sinon.match.func);
          spyProcessListener.restore();
        });
      });

      it("disabled - should not capture unhandled promise rejections", async () => {
        const wrappedHandler = withSentry({ ...options, captureUnhandledRejections: false }, handler);
        const spyProcessListener = sandbox.spy(process, "on");

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(spyProcessListener).to.not.be.calledWith("unhandledRejection", sinon.match.func);
          spyProcessListener.restore();
        });
      });
    });

    describe("captureUncaughtException", () => {
      /** Lambda function handler */
      const handler = async (event: any, context: any) => {
        return "Go Serverless! Your function executed successfully!";
      };

      it("enabled - should capture uncaught exceptions", async () => {
        const wrappedHandler = withSentry({ ...options, captureUncaughtException: true }, handler);
        const spyProcessListener = sandbox.spy(process, "on");

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(spyProcessListener).to.be.calledWith("uncaughtException", sinon.match.func);
          spyProcessListener.restore();
        });
      });

      it("disabled - should not capture uncaught exceptions", async () => {
        const wrappedHandler = withSentry({ ...options, captureUncaughtException: false }, handler);
        const spyProcessListener = sandbox.spy(process, "on");

        return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled.then(() => {
          expect(mockSentry.init).to.be.calledOnce;
          expect(spyProcessListener).to.not.be.calledWith("uncaughtException", sinon.match.func);
          spyProcessListener.restore();
        });
      });
    });

    describe("captureMemoryWarnings", () => {
      it("should warn if Lambda function is close to running out of memory", (done) => {
        // TODO
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

      afterEach(() => {
        (mockContext.getRemainingTimeInMillis as Sinon.SinonStub<any>).restore();
      });

      it("should warn if more than half of the originally available time has passed", () => {
        const wrappedHandler = withSentry(options, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then(
          (result) => {
            expect(mockSentry.captureMessage).to.be.calledWith("Function Execution Time Warning");
            expect(mockScope.setLevel).to.be.calledWith("warning");
            expect(mockScope.setExtras).to.be.calledWith({
              TimeRemainingInMsec: sinon.match.number,
            });
            // The callback happens exactly at half-time
            expect(mockScope.setExtras.firstCall.args[0].TimeRemainingInMsec)
              .to.be.lessThan(remainingTime / 2 + 1)
              .and.above(remainingTime / 2 - 100);
          },
        );
      });

      it("should error if Lambda timeout is hit", () => {
        const wrappedHandler = withSentry(options, handler);
        return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled.then(
          (result) => {
            expect(mockSentry.captureMessage).to.be.calledWith("Function Timed Out");
            expect(mockScope.setLevel).to.be.calledWith("error");
            expect(mockScope.setExtras).to.be.calledWith({
              TimeRemainingInMsec: sinon.match.number,
            });
            // The callback happens 500 msecs before Lambda would time out
            expect(mockScope.setExtras.secondCall.args[0].TimeRemainingInMsec).to.be.lessThan(501).and.above(400);
          },
        );
      });
    });
  });
});
