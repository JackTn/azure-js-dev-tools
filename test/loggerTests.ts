import { assert } from "chai";
import { InMemoryLogger, getInMemoryLogger, wrapLogger, Logger, getConsoleLogger, getAzureDevOpsLogger } from "../lib";

describe("logger.ts", function () {
  it("getConsoleLogger()", function () {
    const logger: Logger = getConsoleLogger();
    assert(logger);
    assert(logger.logError);
    assert(logger.logInfo);
    assert(logger.logSection);
    assert(logger.logVerbose);
    assert(logger.logWarning);
  });

  describe("getAzureDevopsLogger()", function () {
    it("with no options", function () {
      const logger: Logger = getAzureDevOpsLogger();
      assert(logger);
      assert(logger.logError);
      assert(logger.logInfo);
      assert(logger.logSection);
      assert(logger.logVerbose);
      assert(logger.logWarning);
    });

    it("with empty options", function () {
      const logger: Logger = getAzureDevOpsLogger({});
      assert(logger);
      assert(logger.logError);
      assert(logger.logInfo);
      assert(logger.logSection);
      assert(logger.logVerbose);
      assert(logger.logWarning);
    });

    it("with toWrap logger", function () {
      const inMemoryLogger: InMemoryLogger = getInMemoryLogger({ logVerbose: true });
      const logger: Logger = getAzureDevOpsLogger({ toWrap: inMemoryLogger });

      logger.logError("a");
      assert.deepEqual(inMemoryLogger.allLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.errorLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.infoLogs, []);
      assert.deepEqual(inMemoryLogger.sectionLogs, []);
      assert.deepEqual(inMemoryLogger.warningLogs, []);
      assert.deepEqual(inMemoryLogger.verboseLogs, []);

      logger.logInfo("b");
      assert.deepEqual(inMemoryLogger.allLogs, ["##[error]a", "b"]);
      assert.deepEqual(inMemoryLogger.errorLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.infoLogs, ["b"]);
      assert.deepEqual(inMemoryLogger.sectionLogs, []);
      assert.deepEqual(inMemoryLogger.warningLogs, []);
      assert.deepEqual(inMemoryLogger.verboseLogs, []);

      logger.logSection("c");
      assert.deepEqual(inMemoryLogger.allLogs, ["##[error]a", "b", "##[section]c"]);
      assert.deepEqual(inMemoryLogger.errorLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.infoLogs, ["b"]);
      assert.deepEqual(inMemoryLogger.sectionLogs, ["##[section]c"]);
      assert.deepEqual(inMemoryLogger.warningLogs, []);
      assert.deepEqual(inMemoryLogger.verboseLogs, []);

      logger.logWarning("d");
      assert.deepEqual(inMemoryLogger.allLogs, ["##[error]a", "b", "##[section]c", "##[warning]d"]);
      assert.deepEqual(inMemoryLogger.errorLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.infoLogs, ["b"]);
      assert.deepEqual(inMemoryLogger.sectionLogs, ["##[section]c"]);
      assert.deepEqual(inMemoryLogger.warningLogs, ["##[warning]d"]);
      assert.deepEqual(inMemoryLogger.verboseLogs, []);

      logger.logVerbose("e");
      assert.deepEqual(inMemoryLogger.allLogs, ["##[error]a", "b", "##[section]c", "##[warning]d", "e"]);
      assert.deepEqual(inMemoryLogger.errorLogs, ["##[error]a"]);
      assert.deepEqual(inMemoryLogger.infoLogs, ["b"]);
      assert.deepEqual(inMemoryLogger.sectionLogs, ["##[section]c"]);
      assert.deepEqual(inMemoryLogger.warningLogs, ["##[warning]d"]);
      assert.deepEqual(inMemoryLogger.verboseLogs, ["e"]);
    });
  });

  describe("InMemoryLogger", function () {
    it("getInMemoryLogger()", function () {
      const logger: InMemoryLogger = getInMemoryLogger();
      assert.deepEqual(logger.allLogs, []);
      assert.deepEqual(logger.infoLogs, []);
      assert.deepEqual(logger.errorLogs, []);
    });

    it("logInfo()", function () {
      const logger: InMemoryLogger = getInMemoryLogger();
      logger.logInfo("apples");
      assert.deepEqual(logger.allLogs, ["apples"]);
      assert.deepEqual(logger.infoLogs, ["apples"]);
      assert.deepEqual(logger.errorLogs, []);
    });

    it("logError()", function () {
      const logger: InMemoryLogger = getInMemoryLogger();
      logger.logError("bananas");
      assert.deepEqual(logger.allLogs, ["bananas"]);
      assert.deepEqual(logger.infoLogs, []);
      assert.deepEqual(logger.errorLogs, ["bananas"]);
    });
  });

  describe("wrapLogger()", function () {
    it("with overridden logInfo()", function () {
      const logger: InMemoryLogger = getInMemoryLogger();
      const wrappedLogger: Logger = wrapLogger(logger, {
        logInfo: (text: string) => logger.logInfo(`[INFO] ${text}`)
      });

      wrappedLogger.logInfo("abc");
      assert.deepEqual(logger.allLogs, ["[INFO] abc"]);
      assert.deepEqual(logger.infoLogs, ["[INFO] abc"]);
      assert.deepEqual(logger.errorLogs, []);

      wrappedLogger.logError("xyz");
      assert.deepEqual(logger.allLogs, ["[INFO] abc", "xyz"]);
      assert.deepEqual(logger.infoLogs, ["[INFO] abc"]);
      assert.deepEqual(logger.errorLogs, ["xyz"]);
    });

    it("with overridden logError()", function () {
      const logger: InMemoryLogger = getInMemoryLogger();
      const wrappedLogger: Logger = wrapLogger(logger, {
        logError: (text: string) => logger.logError(`[ERROR] ${text}`)
      });

      wrappedLogger.logInfo("abc");
      assert.deepEqual(logger.allLogs, ["abc"]);
      assert.deepEqual(logger.infoLogs, ["abc"]);
      assert.deepEqual(logger.errorLogs, []);

      wrappedLogger.logError("xyz");
      assert.deepEqual(logger.allLogs, ["abc", "[ERROR] xyz"]);
      assert.deepEqual(logger.infoLogs, ["abc"]);
      assert.deepEqual(logger.errorLogs, ["[ERROR] xyz"]);
    });
  });
});