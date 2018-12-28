import { readFileSync, writeFileSync } from "fs";
import { any, contains, first } from "./arrays";
import { StringMap } from "./common";
import { fileExistsSync, folderExistsSync, getChildFolderPaths } from "./fileSystem2";
import { getConsoleLogger, Logger } from "./logger";
import { npmInstall, npmView, NPMViewResult } from "./npm";
import { findPackageJsonFileSync, PackageJson, PackageLockJson, readPackageJsonFileSync, readPackageLockJsonFileSync, removePackageLockJsonDependencies, writePackageJsonFileSync, writePackageLockJsonFileSync } from "./packageJson";
import { getParentFolderPath, joinPath, normalize } from "./path";
import yargs = require("yargs");

export type DepedencyType = "local" | "latest";

export interface PackageFolder {
  /**
   * The path to the package folder.
   */
  path: string;
  /**
   * Whether or not NPM install will be run when this PackageFolder changes its dependencies.
   * Undefined will be treated the same as true.
   */
  runNPMInstall?: boolean;
  /**
   * If the package is not found (such as when updating to the latest version of an unpublished
   * package), then set the target package version to this default version.
   */
  defaultVersion?: string;
  /**
   * A list of dependencies to not update, even if they are found locally.
   */
  dependenciesToIgnore?: string[];
}

export interface ClonedPackage extends PackageFolder {
  updated?: boolean;
  targetVersion?: string;
}

/**
 * The optional arguments that can be provided to changeClonedDependenciesTo().
 */
export interface ChangeClonedDependenciesToOptions {
  /**
   * The logger that will be used while changing cloned dependency versions. If not defined, this
   * will default to the console logger.
   */
  logger?: Logger;

  /**
   * Whether or not changing a cloned dependency will recursively change the cloned dependency's
   * dependencies as well. If not defined, this will default to true.
   */
  recursive?: boolean;

  /**
   * Whether or not packages will have "npm install" invoked, even if they don't have any dependency
   * changes. Any packages that are marked as "runNPMInstall: false" will still not have
   * "npm install" run.
   */
  forceInstall?: boolean;

  /**
   * Whether or not the function will set process.exitCode in addition to returning the exit code.
   * If not defined, this will default to true.
   */
  setProcessExitCode?: boolean;

  /**
   * The package folders that will be processed by changeClonedDependenciesTo().
   */
  packageFolders?: (string | PackageFolder)[];

  /**
   * An extra set of files that will have dependency references updated.
   */
  extraFilesToUpdate?: string[];
}

/**
 * Update the provided dependencies using the provided dependencyType then return the dependencies
 * that were changed.
 */
function updateDependencies(clonedPackage: ClonedPackage, dependencies: StringMap<string> | undefined, dependencyType: DepedencyType, clonedPackages: StringMap<ClonedPackage | undefined>, logger: Logger): string[] {
  const changed: string[] = [];

  if (dependencies) {
    for (const dependencyName of Object.keys(dependencies)) {
      if (!contains(clonedPackage.dependenciesToIgnore, dependencyName)) {
        const dependencyVersion: string = dependencies[dependencyName];
        const dependencyTargetVersion: string | undefined = getDependencyTargetVersion(clonedPackage, dependencyName, dependencyType, clonedPackages);
        if (dependencyTargetVersion && dependencyVersion !== dependencyTargetVersion) {
          logger.logInfo(`  Changing "${dependencyName}" from "${dependencyVersion}" to "${dependencyTargetVersion}"...`);
          dependencies[dependencyName] = dependencyTargetVersion;
          changed.push(dependencyName);
        }
      }
    }
  }

  return changed;
}

/**
 * Find the path to the folder that contains a package.json file with the provided package name.
 */
export function findPackage(packageName: string, startPath: string, clonedPackages?: StringMap<ClonedPackage | undefined>, logger?: Logger): ClonedPackage | undefined {
  let result: ClonedPackage | undefined;
  if (clonedPackages && packageName in clonedPackages) {
    result = clonedPackages[packageName];
  } else {
    const normalizedStartPath: string = normalize(startPath);

    const visitedFolders: string[] = [];
    const foldersToVisit: string[] = [];

    const addFolderToVisit = (folderPath: string) => {
      if (!contains(visitedFolders, folderPath) && !contains(foldersToVisit, folderPath)) {
        foldersToVisit.push(folderPath);
      }
    };
    const logInfo = (text: string) => logger && logger.logInfo(text);
    const logSection = (text: string) => logger && logger.logSection(text);

    if (fileExistsSync(normalizedStartPath)) {
      foldersToVisit.push(getParentFolderPath(normalizedStartPath));
    } else if (folderExistsSync(normalizedStartPath)) {
      foldersToVisit.push(normalizedStartPath);
    }

    while (foldersToVisit.length > 0) {
      const folderPath: string = foldersToVisit.shift()!;
      visitedFolders.push(folderPath);

      const packageJsonFilePath: string = joinPath(folderPath, "package.json");
      logSection(`Looking for package "${packageName}" at "${packageJsonFilePath}"...`);
      if (fileExistsSync(packageJsonFilePath)) {
        logInfo(`"${packageJsonFilePath}" file exists. Comparing package names...`);
        const packageJson: PackageJson = readPackageJsonFileSync(packageJsonFilePath);
        if (packageJson.name) {
          if (packageJson.name === packageName) {
            result = { path: folderPath };
            break;
          }
        }
      }

      if (!result) {
        const parentFolderPath: string = getParentFolderPath(folderPath);
        if (parentFolderPath) {
          addFolderToVisit(parentFolderPath);
          getChildFolderPaths(parentFolderPath)!
            .forEach(addFolderToVisit);
        }
      }
    }

    if (clonedPackages) {
      clonedPackages[packageName] = result;
    }
  }

  return result;
}

function getDependencyTargetVersion(clonedPackage: ClonedPackage, dependencyName: string, dependencyType: DepedencyType, clonedPackages: StringMap<ClonedPackage | undefined>): string | undefined {
  let result: string | undefined;
  const dependencyClonedPackage: ClonedPackage | undefined = findPackage(dependencyName, clonedPackage.path, clonedPackages);
  if (dependencyClonedPackage) {
    if (!dependencyClonedPackage.targetVersion) {
      if (dependencyType === "local") {
        dependencyClonedPackage.targetVersion = `file:${dependencyClonedPackage.path}`;
      } else if (dependencyType === "latest") {
        const dependencyViewResult: NPMViewResult = npmView({ packageName: dependencyName });
        const distTags: StringMap<string> | undefined = dependencyViewResult["dist-tags"];
        dependencyClonedPackage.targetVersion = distTags && distTags["latest"];
        if (dependencyClonedPackage.targetVersion) {
          dependencyClonedPackage.targetVersion = "^" + dependencyClonedPackage.targetVersion;
        } else {
          dependencyClonedPackage.targetVersion = dependencyClonedPackage.defaultVersion;
        }
      }
    }
    result = dependencyClonedPackage.targetVersion;
  }
  return result;
}

/**
 * Change all of the cloned dependencies in the package found at the provided package path to the
 * provided dependency type.
 */
export function changeClonedDependenciesTo(packagePath: string, dependencyType: DepedencyType, options?: ChangeClonedDependenciesToOptions): number {
  options = options || {};
  const logger: Logger = options.logger || getConsoleLogger();

  const recursiveArgument: any = yargs.argv["recursive"];
  const recursive: boolean = (options.recursive != undefined ? options.recursive : (recursiveArgument !== "false" && recursiveArgument !== false));

  const forceInstallArgument: any = yargs.argv["force-install"];
  const forceInstall: boolean = (options.forceInstall != undefined ? options.forceInstall : (forceInstallArgument === "true" || forceInstallArgument === true));

  let exitCode = 0;

  const clonedPackages: StringMap<ClonedPackage | undefined> = {};
  const packageFolderPathsToVisit: string[] = [];
  const packageFolderPathsVisited: string[] = [];

  const packagePathsToAdd: string[] = [packagePath];
  if (options.packageFolders) {
    const packageFolderPaths: string[] = options.packageFolders.map((packageFolder: string | PackageFolder) => typeof packageFolder === "string" ? packageFolder : packageFolder.path);
    packagePathsToAdd.push(...packageFolderPaths);
  }

  for (const packagePathToAdd of packagePathsToAdd) {
    // logger.logInfo(`Looking for package.json file at or above "${packagePathToAdd}"...`);
    const packageJsonFilePath: string | undefined = findPackageJsonFileSync(packagePathToAdd);
    if (!packageJsonFilePath) {
      logger.logError(`Could not find a package.json at or above the provided package path (${packagePathToAdd}).`);
      exitCode = 1;
      break;
    } else {
      // logger.logInfo(`Found package.json file at "${packageJsonFilePath}".`);
      const packageFolderPath: string = getParentFolderPath(packageJsonFilePath);
      const packageJson: PackageJson = readPackageJsonFileSync(packageJsonFilePath);
      const packageName: string = packageJson.name!;
      packageFolderPathsToVisit.push(packageFolderPath);

      const clonedPackage: ClonedPackage = {
        path: packageFolderPath
      };

      const packageFolder: string | PackageFolder | undefined = first(options.packageFolders, (packageFolder: string | PackageFolder) => (typeof packageFolder === "string" ? packageFolder : packageFolder.path) === packagePathToAdd);
      if (packageFolder && typeof packageFolder !== "string") {
        clonedPackage.defaultVersion = packageFolder.defaultVersion;
        clonedPackage.dependenciesToIgnore = packageFolder.dependenciesToIgnore;
        clonedPackage.runNPMInstall = packageFolder.runNPMInstall;
      }

      clonedPackages[packageName] = clonedPackage;
    }
  }

  const folderPathsToRunNPMInstallIn: string[] = [];

  while (packageFolderPathsToVisit.length > 0 && exitCode === 0) {
    const packageFolderPath: string = packageFolderPathsToVisit.shift()!;
    packageFolderPathsVisited.push(packageFolderPath);

    logger.logSection(`Updating package folder "${packageFolderPath}"...`);

    const packageJsonFilePath: string = joinPath(packageFolderPath, "package.json");
    const packageJson: PackageJson = readPackageJsonFileSync(packageJsonFilePath);
    const packageName: string = packageJson.name!;
    const clonedPackage: ClonedPackage | undefined = clonedPackages[packageName]!;
    clonedPackage.updated = true;

    const dependenciesChanged: string[] = updateDependencies(clonedPackage, packageJson.dependencies, dependencyType, clonedPackages, logger);
    const devDependenciesChanged: string[] = updateDependencies(clonedPackage, packageJson.devDependencies, dependencyType, clonedPackages, logger);
    if (!any(dependenciesChanged) && !any(devDependenciesChanged)) {
      logger.logInfo(`  No changes made.`);
      if (clonedPackage.runNPMInstall !== false && forceInstall) {
        folderPathsToRunNPMInstallIn.push(packageFolderPath);
      }
    } else {
      writePackageJsonFileSync(packageJson, packageJsonFilePath);

      const packageLockJsonFilePath: string = joinPath(packageFolderPath, "package-lock.json");
      if (fileExistsSync(packageLockJsonFilePath)) {
        const packageLockJson: PackageLockJson = readPackageLockJsonFileSync(packageLockJsonFilePath);
        removePackageLockJsonDependencies(packageLockJson, ...dependenciesChanged, ...devDependenciesChanged);
        writePackageLockJsonFileSync(packageLockJson, packageLockJsonFilePath);
      }

      if (clonedPackage.runNPMInstall !== false) {
        folderPathsToRunNPMInstallIn.push(packageFolderPath);
      }
    }

    if (recursive) {
      const allDependencyNames: string[] = [];
      if (packageJson.dependencies) {
        allDependencyNames.push(...Object.keys(packageJson.dependencies));
      }
      if (packageJson.devDependencies) {
        allDependencyNames.push(...Object.keys(packageJson.devDependencies));
      }

      for (const dependencyName of allDependencyNames) {
        const clonedDependency: ClonedPackage | undefined = clonedPackages[dependencyName];
        if (clonedDependency) {
          const clonedDependencyFolderPath: string = clonedDependency.path;
          if (!clonedDependency.updated && !contains(packageFolderPathsVisited, clonedDependencyFolderPath) && !contains(packageFolderPathsToVisit, clonedDependencyFolderPath)) {
            packageFolderPathsToVisit.push(clonedDependencyFolderPath);
          }
        }
      }
    }
  }

  for (const folderPath of folderPathsToRunNPMInstallIn) {
    exitCode = npmInstall({
      executionFolderPath: folderPath,
      log: logger.logSection,
      showCommand: true
    }).exitCode;

    if (exitCode !== 0) {
      break;
    }
  }

  if (exitCode === 0 && options.extraFilesToUpdate) {
    for (const extraFileToUpdate of options.extraFilesToUpdate) {
      if (!fileExistsSync(extraFileToUpdate)) {
        logger.logError(`The extra file to update "${extraFileToUpdate}" doesn't exist.`);
        exitCode = 2;
        break;
      } else {
        logger.logSection(`Updating extra file "${extraFileToUpdate}"...`);
        const originalFileContents: string = readFileSync(extraFileToUpdate, { encoding: "utf8" });
        let updatedFileContents: string = originalFileContents;

        for (const clonedPackageName of Object.keys(clonedPackages)) {
          const clonedPackage: ClonedPackage | undefined = clonedPackages[clonedPackageName];
          if (clonedPackage && clonedPackage.targetVersion) {
            const regularExpression = new RegExp(`\\.StringProperty\\("${clonedPackageName}", "(.*)"\\);`);
            const match: RegExpMatchArray | null = updatedFileContents.match(regularExpression);
            if (match && match[1] !== clonedPackage.targetVersion) {
              logger.logInfo(`  Changing "${clonedPackageName}" version from "${match[1]}" to "${clonedPackage.targetVersion}"...`);
              updatedFileContents = updatedFileContents.replace(regularExpression, `.StringProperty("${clonedPackageName}", "${clonedPackage.targetVersion}");`);
            }
          }
        }

        if (originalFileContents === updatedFileContents) {
          logger.logInfo(`  No changes made.`);
        } else {
          logger.logInfo(`  Writing changes back to file...`);
          writeFileSync(extraFileToUpdate, updatedFileContents);
        }
      }
    }
  }

  if (options.setProcessExitCode !== false) {
    process.exitCode = exitCode;
  }

  return exitCode;
}