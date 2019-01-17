import { assert } from "chai";
import { isPackageJsonPublished, PackageJson } from "../lib";

describe("packageJson.ts", function () {
  describe("isPackageJsonPublished(PackageJson)", function () {
    this.timeout(5000);

    it("with no package name", function () {
      const packageJson: PackageJson = {
        version: "1.2.3"
      };
      assert.strictEqual(isPackageJsonPublished(packageJson), false);
    });

    it("with no package version", function () {
      const packageJson: PackageJson = {
        name: "@azure/ms-rest-js"
      };
      assert.strictEqual(isPackageJsonPublished(packageJson), false);
    });

    it("with package name and version", function () {
      const packageJson: PackageJson = {
        name: "@azure/ms-rest-js",
        version: "1.1.1"
      };
      assert.strictEqual(isPackageJsonPublished(packageJson), true);
    });

    it("with package name and version that doesn't exist", function () {
      const packageJson: PackageJson = {
        name: "@azure/ms-rest-js",
        version: "0.9.7"
      };
      assert.strictEqual(isPackageJsonPublished(packageJson), false);
    });
  });
});