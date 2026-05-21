import { isNodeModulesPath } from "./path-utils";
import {
  findFiberByHostInstance,
  getDebugSourceFromFiber,
} from "./react-fiber";
import { getDebugSourceFromStack } from "./source-map-resolver";
import { getStorybookDebugSource } from "./storybook-resolver";
import type { DebugSource, Fiber } from "./types";

const getBestDebugSourceForFiber = async (
  fiber: Fiber | null,
): Promise<DebugSource | null> => {
  if (!fiber) return null;

  let nodeModulesCandidate: DebugSource | null = null;

  const directSource = getDebugSourceFromFiber(fiber);
  if (directSource) {
    if (!isNodeModulesPath(directSource.fileName)) return directSource;
    nodeModulesCandidate = directSource;
  }

  const stackSource = await getDebugSourceFromStack(fiber);
  if (stackSource) {
    if (!isNodeModulesPath(stackSource.fileName)) return stackSource;
    if (!nodeModulesCandidate) nodeModulesCandidate = stackSource;
  }

  let owner = fiber._debugOwner || null;
  let ownerDepth = 0;
  while (owner && ownerDepth < 20) {
    const ownerSource = getDebugSourceFromFiber(owner);
    if (ownerSource) {
      if (!isNodeModulesPath(ownerSource.fileName)) return ownerSource;
      if (!nodeModulesCandidate) nodeModulesCandidate = ownerSource;
    }

    owner = owner._debugOwner || null;
    ownerDepth += 1;
  }

  return nodeModulesCandidate;
};

export const findDebugSourceByHostInstance = async (
  target: Element,
): Promise<DebugSource | null> => {
  let nodeModulesCandidate: DebugSource | null = null;
  let currentElement: Element | null = target;
  let checkedDepth = 0;

  while (currentElement && checkedDepth < 30) {
    const fiber = findFiberByHostInstance(currentElement);
    const debugSource = await getBestDebugSourceForFiber(fiber);

    if (debugSource) {
      if (!isNodeModulesPath(debugSource.fileName)) return debugSource;
      if (!nodeModulesCandidate) nodeModulesCandidate = debugSource;
    }

    currentElement = currentElement.parentElement;
    checkedDepth += 1;
  }

  const storybookDebugSource = await getStorybookDebugSource();
  if (storybookDebugSource) return storybookDebugSource;

  return nodeModulesCandidate;
};
