/* eslint-disable no-unused-vars, promises/always-return */
"use strict";

const chai = require("chai");
const sinon = require("sinon");
const path = require("path");
const { fork } = require("child_process");
const RavenLambdaWrapper = require("./index");

const expect = chai.expect;
chai.use(require("chai-as-promised"));
chai.use(require("sinon-chai"));

const sandbox = sinon.createSandbox();

const RavenMock = {
	config: () => ({ install: () => {} }),
	captureBreadcrumb: () => {},
	captureMessage: (msg, context, cb) => {
		cb && process.nextTick(cb);
	},
	captureException: (err, context, cb) => {
		cb && process.nextTick(cb);
	},
	context: (context, cb) => {
		return cb();
	}
};

describe("RavenLambdaWrapper", () => {

	const mockEvent = {
		foo: "bar",
	};

	const mockContext = {
		getRemainingTimeInMillis: () => 30 * 1000,
		memoryLimitInMB: 1024,
		functionName: "test-function",
		functionVersion: "123",

		done: () => {},
		fail: () => {},
		succeed: () => {},
	};

	afterEach(() => {
		sandbox.restore();
	});


	// ------------------------------------------------------------------------

	describe("No Raven installed", () => {

		describe("Context Succeed/Fail/Done", () => {

			it("should invoke context.succeed callback", (done) => {
				const handler = (event, context) => {
					context.succeed({ message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "succeed").callsFake((result) => {
					expect(result).to.have.property("message").that.is.a("string");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.fail callback", (done) => {
				const handler = (event, context) => {
					context.fail(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "fail").callsFake((err) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.done callback with result", (done) => {
				const handler = (event, context) => {
					context.done(null, { message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "done").callsFake((err, result) => {
					expect(err).to.be.null,
					expect(result).to.have.property("message").that.is.a("string");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.done callback with error", (done) => {
				const handler = (event, context) => {
					context.done(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "done").callsFake((err, result) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});
		});

		describe("Callbacks", () => {

			it("should invoke handler callback on success", (done) => {
				const handler = (event, context, callback) => {
					callback(null, { message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const callback = (err, result) => {
					expect(err).to.be.null,
					expect(result).to.have.property("message").that.is.a("string");
					done();
				};
				wrappedHandler(mockEvent, mockContext, callback);
			});

			it("should invoke handler callback on error", (done) => {
				const handler = (event, context, callback) => {
					callback(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const callback = (err) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				};
				wrappedHandler(mockEvent, mockContext, callback);
			});
		});

		describe("Async/Await (Promises)", () => {

			it("should return fulfilled Promise", () => {
				const handler = (event, context) => {
					return Promise.resolve({ message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled
				.then(result => {
					expect(result).to.have.property("message").that.is.a("string");
				});
			});

			it("should return rejected Promise", () => {
				const handler = (event, context) => {
					return Promise.reject(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.rejectedWith("Test Error");
			});
		});
	});


	// ------------------------------------------------------------------------

	describe("Raven installed", () => {

		before(() => {
			process.env.SENTRY_DSN = "https://sentry.example.com";
			process.env.AWS_LAMBDA_FUNCTION_NAME = "Test-Lambda-Function";
			process.env.LAMBDA_TASK_ROOT = "/tmp/test";
		});

		describe("Context Succeed/Fail/Done", () => {

			it("should invoke context.succeed callback", (done) => {
				const handler = (event, context) => {
					context.succeed({ message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "succeed").callsFake((result) => {
					expect(result).to.have.property("message").that.is.a("string");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.fail callback", (done) => {
				const handler = (event, context) => {
					context.fail(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "fail").callsFake((err) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.done callback with result", (done) => {
				const handler = (event, context) => {
					context.done(null, { message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "done").callsFake((err, result) => {
					expect(err).to.be.null,
					expect(result).to.have.property("message").that.is.a("string");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should invoke context.done callback with error", (done) => {
				const handler = (event, context) => {
					context.done(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				sandbox.stub(mockContext, "done").callsFake((err, result) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should capture fail", (done) => {
				const handler = (event, context) => {
					context.fail(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const spy = sandbox.spy(RavenMock, "captureException");
				sandbox.stub(mockContext, "fail").callsFake((err) => {
					expect(spy).to.be.calledOnce;
					expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});

			it("should capture context.done with error", (done) => {
				const handler = (event, context) => {
					context.done(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const spy = sandbox.spy(RavenMock, "captureException");
				sandbox.stub(mockContext, "done").callsFake((err) => {
					expect(spy).to.be.calledOnce;
					expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
					done();
				});
				wrappedHandler(mockEvent, mockContext);
			});
		});

		describe("Callbacks", () => {

			it("should invoke handler callback on success", (done) => {
				const handler = (event, context, callback) => {
					callback(null, { message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const callback = (err, result) => {
					expect(err).to.be.null,
					expect(result).to.have.property("message").that.is.a("string");
					done();
				};
				wrappedHandler(mockEvent, mockContext, callback);
			});

			it("should invoke handler callback on error", (done) => {
				const handler = (event, context, callback) => {
					callback(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const callback = (err) => {
					expect(err).to.be.an("error").with.property("message", "Test Error");
					done();
				};
				wrappedHandler(mockEvent, mockContext, callback);
			});

			it("should capture error", (done) => {
				const handler = (event, context, callback) => {
					callback(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const spy = sandbox.spy(RavenMock, "captureException");
				const callback = (err) => {
					expect(spy).to.be.calledOnce;
					expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
					done();
				};
				wrappedHandler(mockEvent, mockContext, callback);
			});
		});

		describe("Async/Await (Promises)", () => {

			it("should return fulfilled Promise", () => {
				const handler = (event, context) => {
					return Promise.resolve({ message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.fulfilled
				.then(result => {
					expect(result).to.have.property("message").that.is.a("string");
				});
			});

			it("should return rejected Promise", () => {
				const handler = (event, context) => {
					return Promise.reject(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.rejectedWith("Test Error");
			});

			it("should capture rejection", () => {
				const handler = (event, context) => {
					return Promise.reject(new Error("Test Error"));
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				const spy = sandbox.spy(RavenMock, "captureException");
				return expect(wrappedHandler(mockEvent, mockContext, sinon.stub())).to.eventually.be.rejectedWith("Test Error")
				.then(() => {
					expect(spy).to.be.calledOnce;
					expect(spy).to.be.calledWith(sinon.match.instanceOf(Error).and(sinon.match.has("message", "Test Error")));
				});
			});
		});

		describe("Context", () => {

			it("should retain original context object", () => {
				const originalContext = mockContext;
				const handler = (event, context, callback) => {
					expect(context).to.be.equal(originalContext);
					return Promise.resolve({ message: "Go Serverless! Your function executed successfully!", event });
				};

				const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
				return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled;
			});
		});

		describe("Settings", () => {

			const handler = (event, context, callback) => {
				callback(null, { message: "Go Serverless! Your function executed successfully!", event });
			};

			describe("autoBreadcrumbs", () => {
				it("should trace Lambda function as breadcrumb", (done) => {
					const spy = sandbox.spy(RavenMock, "captureBreadcrumb");
					const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
					const callback = (err, result) => {
						expect(spy).to.be.calledOnce;
						expect(spy).to.be.calledWith({ category: "lambda", message: "Test-Lambda-Function", data: {}, level: "info" });
						done();
					};
					wrappedHandler(mockEvent, mockContext, callback);
				});
			});

			describe("filterLocal", () => {
				it("should not install Raven when running locally if enabled", (done) => {
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

			describe("captureUnhandledRejections", (done) => {
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

			describe("captureTimeoutWarnings", function() {
				const remainingTime = 2000;
				this.timeout(remainingTime * 2);

				const handler = (event, context) => {
					// Now wait for the timeout...
					return new Promise(resolve => setTimeout(resolve, remainingTime + 100));
				};

				beforeEach(() => {
					const start = Date.now();
					const stubRemainingTime = sandbox.stub(mockContext, "getRemainingTimeInMillis").callsFake(() => start + remainingTime - Date.now());
				});

				it("should warn if more than half of the originally available time has passed", () => {
					const spy = sandbox.spy(RavenMock, "captureMessage");
					const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
					return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled
					.then(result => {
						expect(spy).to.be.calledWith(
							"Function Execution Time Warning",
							{ extra: { TimeRemainingInMsec: sinon.match.number }, level: "warning" },
							sinon.match.func.or(undefined)
						);
						// The callback happens exactly at half-time
						expect(spy.firstCall.args[1].extra.TimeRemainingInMsec).to.be.lessThan(remainingTime/2).and.above(remainingTime/2-100);
					});
				});

				it("should error if Lambda timeout is hit", function() {
					const spy = sandbox.spy(RavenMock, "captureMessage");
					const wrappedHandler = RavenLambdaWrapper.handler(RavenMock, handler);
					return expect(wrappedHandler(mockEvent, mockContext)).to.eventually.be.fulfilled
					.then(result => {
						expect(spy).to.be.calledWith(
							"Function Timed Out",
							{ extra: { TimeRemainingInMsec: sinon.match.number }, level: "error" },
							sinon.match.func.or(undefined)
						);
						// The callback happens 500 msecs before Lambda would time out
						expect(spy.secondCall.args[1].extra.TimeRemainingInMsec).to.be.lessThan(500).and.above(400);
					});
				});
			});
		});
	});
});
