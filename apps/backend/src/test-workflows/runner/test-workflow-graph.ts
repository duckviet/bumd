/**
 * Topological sort (Kahn's algorithm) for workflow DAG.
 * Throws WORKFLOW_CYCLE if a cycle is detected.
 * Throws WORKFLOW_INVALID for dangling edge refs.
 */
export function buildTopologicalOrder(
  nodeIds: readonly string[],
  edges: readonly { readonly source: string; readonly target: string }[],
): string[] {
  const nodeSet = new Set(nodeIds);

  // Validate edge refs
  for (const edge of edges) {
    if (!nodeSet.has(edge.source)) {
      throw new Error(`WORKFLOW_INVALID: Edge source "${edge.source}" does not exist`);
    }
    if (!nodeSet.has(edge.target)) {
      throw new Error(`WORKFLOW_INVALID: Edge target "${edge.target}" does not exist`);
    }
  }

  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

  for (const edge of edges) {
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (order.length !== nodeIds.length) {
    throw new Error("WORKFLOW_CYCLE");
  }

  return order;
}

/**
 * Returns the set of all transitive ancestor node IDs for a given node.
 */
export function getAncestors(
  nodeId: string,
  edges: readonly { readonly source: string; readonly target: string }[],
): Set<string> {
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parents.get(edge.target) ?? [];
    list.push(edge.source);
    parents.set(edge.target, list);
  }

  const ancestors = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const parent of parents.get(current) ?? []) {
      if (!ancestors.has(parent)) {
        ancestors.add(parent);
        stack.push(parent);
      }
    }
  }
  return ancestors;
}

/**
 * Returns the set of direct and transitive descendant node IDs.
 */
export function getDescendants(
  nodeId: string,
  edges: readonly { readonly source: string; readonly target: string }[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.source) ?? [];
    list.push(edge.target);
    children.set(edge.source, list);
  }

  const descendants = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of children.get(current) ?? []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        stack.push(child);
      }
    }
  }
  return descendants;
}
