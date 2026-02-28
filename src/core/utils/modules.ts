import { readdir } from 'node:fs/promises';

import { logger } from '@/common/logger/index.js';

import { ModuleSchema } from '../lib/Module.js';

export const getModules = async () => {
  try {
    const modulesContents = await readdir('./dist/modules', {
      withFileTypes: true,
    });

    const modules = modulesContents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    logger.debug(
      `Discovered ${modules.length} module(s): ${modules.join(', ')}`,
    );

    return modules;
  } catch (error) {
    logger.error(`Failed discovering modules\n${String(error)}`);
    return [];
  }
};

const loadModule = async (moduleName: string) => {
  try {
    const initFile = `../../modules/${moduleName}/index.js`;
    const moduleExport: unknown = await import(initFile);
    return ModuleSchema.safeParse(moduleExport);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot find module')
    ) {
      return null;
    }
    logger.error(`Failed loading module ${moduleName}\n${String(error)}`);
    throw error;
  }
};

const getModulesWithInit = async (modules: string[]): Promise<string[]> => {
  const modulesWithInit = [];

  for (const module of modules) {
    const parseResult = await loadModule(module);

    if (parseResult === null) {
      logger.debug(`Module ${module} has no index file`);
    } else if (parseResult.success) {
      modulesWithInit.push(module);
    } else {
      logger.debug(`Module ${module} has no init function`);
    }
  }

  return modulesWithInit;
};

const initializeModule = async (moduleName: string): Promise<boolean> => {
  try {
    logger.debug(`Calling init function for module ${moduleName}...`);

    const parseResult = await loadModule(moduleName);
    if (!parseResult?.success) {
      return false;
    }

    const moduleData = parseResult.data;
    const initResult = moduleData.init();
    await Promise.resolve(initResult);
    logger.info(`Module ${moduleName} initialized successfully.`);
    return true;
  } catch (error) {
    logger.warn(`Failed initializing module ${moduleName}\n${String(error)}`);
    return false;
  }
};

export const initializeModules = async () => {
  const modules = await getModules();

  if (modules.length === 0) {
    logger.warn('No modules found to initialize');
    return;
  }

  const modulesWithInit = await getModulesWithInit(modules);

  const totalModules = modules.length;
  let initializedCount = totalModules;

  if (modulesWithInit.length > 0) {
    logger.info(
      `Initializing ${modulesWithInit.length} module(s) with init functions...`,
    );

    for (const module of modulesWithInit) {
      const success = await initializeModule(module);
      if (!success) {
        initializedCount--;
      }
    }
  }

  logger.info(
    `Module initialization complete: ${initializedCount}/${totalModules} module(s) initialized`,
  );
};
