import * as fs from "fs";
import { getParentFolderPath, getPathName, joinPath } from "./path";

/**
 * Get whether or not a file entry (file or folder) exists at the provided entryPath.
 * @param entryPath The path to the file entry to check.
 * @returns Whether or not a file entry (file or folder) exists at the provided entryPath.
 */
export function entryExists(entryPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.exists(entryPath, (exists: boolean) => {
      resolve(exists);
    });
  });
}

/**
 * Check whether or not a symbolic link exists at the provided path.
 * @param symbolicLinkPath The path to check.
 * @returns Whether or not a symbolic link exists at the provided path.
 */
export function symbolicLinkExists(symbolicLinkPath: string): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      const entryExistsResult: boolean = await entryExists(symbolicLinkPath);
      if (!entryExistsResult) {
        resolve(false);
      } else {
        fs.lstat(symbolicLinkPath, (error: NodeJS.ErrnoException, stats: fs.Stats) => {
          if (error) {
            reject(error);
          } else {
            resolve(stats.isSymbolicLink());
          }
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}


/**
 * Check whether or not a file exists at the provided filePath.
 * @param filePath The path to check.
 * @returns Whether or not a file exists at the provided filePath.
 */
export function fileExists(filePath: string): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      const entryExistsResult: boolean = await entryExists(filePath);
      if (!entryExistsResult) {
        resolve(false);
      } else {
        fs.lstat(filePath, (error: NodeJS.ErrnoException, stats: fs.Stats) => {
          if (error) {
            reject(error);
          } else {
            resolve(stats.isFile());
          }
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Check whether or not a folder exists at the provided folderPath.
 * @param folderPath The path to check.
 * @returns Whether or not a folder exists at the provided folderPath.
 */
export function folderExists(folderPath: string): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      const entryExistsResult: boolean = await entryExists(folderPath);
      if (!entryExistsResult) {
        resolve(false);
      } else {
        fs.lstat(folderPath, (error: NodeJS.ErrnoException, stats: fs.Stats) => {
          if (error) {
            reject(error);
          } else {
            resolve(stats.isDirectory());
          }
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Create a folder at the provided folderPath. If the folder is successfully created, then true will
 * be returned. If the folder already exists, then false will be returned.
 * @param folderPath The path to create a folder at.
 */
export function createFolder(folderPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.mkdir(folderPath, (createFolderError1: Error) => {
      if (!createFolderError1) {
        resolve(true);
      } else if (createFolderError1.message.indexOf("EEXIST: file already exists") !== -1) {
        resolve(false);
      } else {
        createFolder(getParentFolderPath(folderPath))
          .then(() => {
            fs.mkdir(folderPath, (createFolderError2: Error) => {
              if (!createFolderError2) {
                resolve(true);
              } else if (createFolderError2.message.indexOf("EEXIST: file already exists") !== -1) {
                resolve(false);
              } else {
                reject(createFolderError2);
              }
            });
          })
          .catch((createParentFolderError: Error) => {
            reject(createParentFolderError);
          });
      }
    });
  });
}

/**
 * Copy the entry at the source entry path to the destination entry path.
 * @param sourceEntryPath The path to the entry to copy from.
 * @param destinationEntryPath The path to entry to copy to.
 */
export async function copyEntry(sourceEntryPath: string, destinationEntryPath: string): Promise<void> {
  if (await fileExists(sourceEntryPath)) {
    await copyFile(sourceEntryPath, destinationEntryPath);
  } else if (await folderExists(sourceEntryPath)) {
    await copyFolder(sourceEntryPath, destinationEntryPath);
  } else {
    throw new Error(`Entry not found: ${sourceEntryPath}`);
  }
}

/**
 * Copy the file at the source file path to the destination file path.
 * @param sourceFilePath The path to the file to copy from.
 * @param destinationFilePath The path to file to copy to.
 * @param createDestinationFolder Whether or not the destination parent folder will be created if it
 * doesn't exist.
 */
export async function copyFile(sourceFilePath: string, destinationFilePath: string, createDestinationFolder = true): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.copyFile(sourceFilePath, destinationFilePath, async (error: NodeJS.ErrnoException) => {
      if (!error) {
        resolve();
      } else if (error.code !== "ENOENT" || !(await fileExists(sourceFilePath)) || !createDestinationFolder) {
        reject(error);
      } else {
        const destinationFolderPath: string = getParentFolderPath(destinationFilePath);
        if (await folderExists(destinationFolderPath)) {
          reject(error);
        } else {
          try {
            await createFolder(destinationFolderPath);
            await copyFile(sourceFilePath, destinationFilePath, false);
            resolve();
          } catch (error2) {
            reject(error);
          }
        }
      }
    });
  });
}

/**
 * Copy the folder at the source folder path to the destination folder path.
 * @param sourceFolderPath The path to the folder to copy from.
 * @param destinationFolderPath The path to the folder to copy to. This folder and its parent
 * folders will be created if they don't already exist.
 */
export async function copyFolder(sourceFolderPath: string, destinationFolderPath: string): Promise<void> {
  const childEntryPaths: string[] | undefined = await getChildEntryPaths(sourceFolderPath);
  if (!childEntryPaths) {
    throw new Error(`Folder not found: ${sourceFolderPath}`);
  } else {
    for (const childEntryPath of childEntryPaths) {
      const childEntryName: string = getPathName(childEntryPath);
      await copyEntry(childEntryPath, joinPath(destinationFolderPath, childEntryName));
    }
  }
}


async function findEntryInPath(entryName: string, startFolderPath: string | undefined, condition: (entryPath: string) => (boolean | Promise<boolean>)): Promise<string | undefined> {
  let result: string | undefined;
  let folderPath: string = startFolderPath || process.cwd();
  while (folderPath) {
    const possibleResult: string = joinPath(folderPath, entryName);
    if (await Promise.resolve(condition(possibleResult))) {
      result = possibleResult;
      break;
    } else {
      const parentFolderPath: string = getParentFolderPath(folderPath);
      if (!parentFolderPath || folderPath === parentFolderPath) {
        break;
      } else {
        folderPath = parentFolderPath;
      }
    }
  }
  return result;
}

/**
 * Find the closest file with the provided name by searching the immediate child folders of the
 * folder at the provided startFolderPath. If no file is found with the provided fileName, then the
 * search will move up to the parent folder of the startFolderPath. This will continue until either
 * the file is found, or the folder being searched does not have a parent folder (if it is a root
 * folder).
 * @param fileName The name of the file to look for.
 * @param startFolderPath The path to the folder where the search will begin.
 * @returns The path to the closest file with the provided fileName, or undefined if no file could
 * be found.
 */
export function findFileInPath(fileName: string, startFolderPath?: string): Promise<string | undefined> {
  return findEntryInPath(fileName, startFolderPath, fileExists);
}

/**
 * Find the closest folder with the provided name by searching the immediate child folders of the
 * folder at the provided startFolderPath. If no folder is found with the provided folderName, then
 * the search will move up to the parent folder of the startFolderPath. This will continue until
 * either the folder is found, or the folder being searched does not have a parent folder (it is a
 * root folder).
 * @param folderName The name of the folder to look for.
 * @param startFolderPath The path to the folder where the search will begin.
 * @returns The path to the closest folder with the provided folderName, or undefined if no folder
 * could be found.
 */
export function findFolderInPath(folderName: string, startFolderPath?: string): Promise<string | undefined> {
  return findEntryInPath(folderName, startFolderPath, folderExists);
}

/**
 * Optional parameters to the getChildFilePaths() function.
 */
export interface GetChildEntriesOptions {
  /**
   * Whether or not to search sub-folders of the provided folderPath.
   */
  recursive?: boolean;

  /**
   * A condition that a child entry path must pass before it will be added to the result.
   */
  condition?: (entryPath: string) => (boolean | Promise<boolean>);

  /**
   * A condition that a child file path must pass before it will be added to the result.
   */
  fileCondition?: (filePath: string) => (boolean | Promise<boolean>);

  /**
   * A condition that a child folder path must pass before it will be added to the result.
   */
  folderCondition?: (folderPath: string) => (boolean | Promise<boolean>);

  /**
   * The array where the matching child folder paths will be added.
   */
  result?: string[];
}

/**
 * Get the child entries of the folder at the provided folderPath. If the provided folder doesn't
 * exist, then undefined will be returned.
 * @param folderPath The path to the folder.
 * @returns The paths to the child entries of the folder at the provided folder path, or undefined
 * if the folder at the provided folder path doesn't exist.
 */
export function getChildEntryPaths(folderPath: string, options: GetChildEntriesOptions = {}): Promise<string[] | undefined> {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, async (error: NodeJS.ErrnoException, entryNames: string[]) => {
      if (error) {
        if (error.code === "ENOENT") {
          resolve(undefined);
        } else {
          reject(error);
        }
      } else {
        const result: string[] = options.result || [];
        for (const entryName of entryNames) {
          const entryPath: string = joinPath(folderPath, entryName);
          let folderPathExists: boolean | undefined;
          let addEntryPathToResult = true;
          if (!options.condition || await Promise.resolve(options.condition(entryPath))) {

            if (options.fileCondition && await fileExists(entryPath)) {
              addEntryPathToResult = await Promise.resolve(options.fileCondition(entryPath));
            } else if (options.folderCondition) {
              folderPathExists = await folderExists(entryPath);
              if (folderPathExists) {
                addEntryPathToResult = await Promise.resolve(options.folderCondition(entryPath));
              }
            }

            if (addEntryPathToResult) {
              result.push(entryPath);
            }
          }

          if (options.recursive && folderPathExists && addEntryPathToResult) {
            options.result = result;
            await getChildEntryPaths(entryPath, options);
          }
        }
        resolve(result);
      }
    });
  });
}

/**
 * Get the child folders of the folder at the provided folderPath. If the provided folder doesn't
 * exist, then undefined will be returned.
 * @param folderPath The path to the folder.
 * @returns The paths to the child folders of the folder at the provided folder path, or undefined
 * if the folder at the provided folder path doesn't exist.
 */
export function getChildFolderPaths(folderPath: string, options: GetChildEntriesOptions = {}): Promise<string[] | undefined> {
  return getChildEntryPaths(folderPath, {
    ...options,
    condition: async (entryPath: string) => await folderExists(entryPath) && (!options.condition || await Promise.resolve(options.condition(entryPath)))
  });
}

/**
 * Get the child folders of the folder at the provided folderPath. If the provided folder doesn't
 * exist, then undefined will be returned.
 * @param folderPath The path to the folder.
 * @returns The paths to the child folders of the folder at the provided folder path, or undefined
 * if the folder at the provided folder path doesn't exist.
 */
export function getChildFilePaths(folderPath: string, options: GetChildEntriesOptions = {}): Promise<string[] | undefined> {
  return getChildEntryPaths(folderPath, {
    ...options,
    condition: async (entryPath: string) => await fileExists(entryPath) && (!options.condition || await Promise.resolve(options.condition(entryPath)))
  });
}

/**
 * Read the contents of the provided file.
 * @param filePath The path to the file to read.
 */
export function readFileContents(filePath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: "utf8" }, (error: NodeJS.ErrnoException, content: string) => {
      if (error) {
        if (error.code === "ENOENT") {
          resolve(undefined);
        } else {
          reject(error);
        }
      } else {
        resolve(content);
      }
    });
  });
}

/**
 * Write the provided contents to the file at the provided filePath.
 * @param filePath The path to the file to write.
 * @param contents The contents to write to the file.
 */
export function writeFileContents(filePath: string, contents: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, contents, (error: NodeJS.ErrnoException) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function deleteEntry(path: string): Promise<boolean> {
  return await folderExists(path)
    ? await deleteFolder(path)
    : await deleteFile(path);
}

/**
 * Delete the file at the provided file path.
 * @param {string} filePath The path to the file to delete.
 */
export function deleteFile(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (error: NodeJS.ErrnoException) => {
      if (error) {
        if (error.code === "ENOENT") {
          resolve(false);
        } else {
          reject(error);
        }
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Delete each of the provided file paths.
 * @param filePaths The file paths that should be deleted.
 */
export async function deleteFiles(...filePaths: string[]): Promise<void> {
  if (filePaths && filePaths.length > 0) {
    for (const filePath of filePaths) {
      await deleteFile(filePath);
    }
  }
}

/**
 * Delete the folder at the provided folder path.
 * @param {string} folderPath The path to the folder to delete.
 */
export async function deleteFolder(folderPath: string): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    let result: boolean | Error | undefined;
    let attempt = 1;
    const maxAttempts = 3;
    while (attempt <= maxAttempts && result === undefined) {
      try {
        const childEntryPaths: string[] | undefined = await getChildEntryPaths(folderPath);
        if (!childEntryPaths) {
          result = false;
          break;
        } else {
          for (const childEntryPath of childEntryPaths) {
            await deleteEntry(childEntryPath);
          }
          fs.rmdir(folderPath, (error: NodeJS.ErrnoException) => {
            if (error) {
              if (error.code === "ENOENT") {
                result = false;
              } else if (attempt === maxAttempts) {
                result = error;
              }
            } else {
              result = true;
            }
          });
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          result = error;
        }
      }
      ++attempt;
    }
    if (typeof result === "boolean") {
      resolve(result);
    } else {
      reject(result);
    }
  });
}
