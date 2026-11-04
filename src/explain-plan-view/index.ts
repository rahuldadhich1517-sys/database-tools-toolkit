import { ParseError, ValidationError } from "../shared/errors";

export interface ExplainCost {
  startup?: number;
  total: number;
}

export interface ExplainTime {
  startup?: number;
  total: number;
}

export interface ExplainPlanNode {
  id: string;
  type: string;
  relation?: string;
  alias?: string;
  estimatedRows?: number;
  estimatedCost?: ExplainCost;
  actualRows?: number;
  actualTimeMs?: ExplainTime;
  actualLoops?: number;
  children: ExplainPlanNode[];
  details: Record<string, unknown>;
  warnings?: string[];
}

export interface NormalizedExplainPlan {
  dialect: "postgres" | "mysql" | "unknown";
  root: ExplainPlanNode;
  raw: unknown;
}

export interface ExplainPlanSummary {
  dialect: "postgres" | "mysql" | "unknown";
  nodeCount: number;
  totalEstimatedCost?: number;
  totalActualTimeMs?: number;
  tablesAccessed: string[];
  operations: Record<string, number>;
  maxCostNode?: {
    id: string;
    type: string;
    relation?: string;
    cost: number;
  };
  slowestNode?: {
    id: string;
    type: string;
    relation?: string;
    timeMs: number;
  };
}

export interface ExplainFormatOptions {
  format?: "ascii" | "json";
  showCost?: boolean;
  showTiming?: boolean;
  showRows?: boolean;
}

let nodeIdCounter = 0;

export function parseExplainPlan(input: string | unknown): NormalizedExplainPlan {
  let parsed: unknown;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new ValidationError("Input EXPLAIN plan cannot be empty", "input");
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new ParseError(
        `Failed to parse EXPLAIN plan JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    parsed = input;
  }

  return normalizeExplainPlan(parsed);
}

export function normalizeExplainPlan(raw: unknown): NormalizedExplainPlan {
  if (typeof raw !== "object" || raw === null) {
    throw new ValidationError("EXPLAIN plan must be a non-null object or array", "plan");
  }

  nodeIdCounter = 0;

  // 1. PostgreSQL JSON: usually an array [ { "Plan": { ... } } ] or an object { "Plan": { ... } }
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && "Plan" in raw[0]) {
    const pgPlan = (raw[0] as { Plan: Record<string, unknown> }).Plan;
    return {
      dialect: "postgres",
      root: normalizePostgresNode(pgPlan),
      raw,
    };
  }

  if (typeof raw === "object" && raw !== null && "Plan" in raw) {
    const pgPlan = (raw as { Plan: Record<string, unknown> }).Plan;
    return {
      dialect: "postgres",
      root: normalizePostgresNode(pgPlan),
      raw,
    };
  }

  // 2. MySQL JSON: usually { "query_block": { ... } }
  if (typeof raw === "object" && raw !== null && "query_block" in raw) {
    const qb = (raw as { query_block: Record<string, unknown> }).query_block;
    return {
      dialect: "mysql",
      root: normalizeMySQLQueryBlock(qb),
      raw,
    };
  }

  // 3. Generic fallback
  return {
    dialect: "unknown",
    root: normalizeGenericNode(raw as Record<string, unknown>),
    raw,
  };
}

function normalizePostgresNode(node: Record<string, unknown>): ExplainPlanNode {
  const id = `node_${++nodeIdCounter}`;
  const type = String(node["Node Type"] ?? "Unknown Operation");
  const relation = node["Relation Name"] ? String(node["Relation Name"]) : undefined;
  const alias = node["Alias"] ? String(node["Alias"]) : undefined;

  let estimatedCost: ExplainCost | undefined;
  if ("Total Cost" in node) {
    estimatedCost = {
      startup: typeof node["Startup Cost"] === "number" ? node["Startup Cost"] : undefined,
      total: Number(node["Total Cost"]),
    };
  }

  let actualTimeMs: ExplainTime | undefined;
  if ("Actual Total Time" in node) {
    actualTimeMs = {
      startup: typeof node["Actual Startup Time"] === "number" ? node["Actual Startup Time"] : undefined,
      total: Number(node["Actual Total Time"]),
    };
  }

  const estimatedRows = typeof node["Plan Rows"] === "number" ? node["Plan Rows"] : undefined;
  const actualRows = typeof node["Actual Rows"] === "number" ? node["Actual Rows"] : undefined;
  const actualLoops = typeof node["Actual Loops"] === "number" ? node["Actual Loops"] : undefined;

  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (
      ![
        "Node Type",
        "Relation Name",
        "Alias",
        "Startup Cost",
        "Total Cost",
        "Actual Startup Time",
        "Actual Total Time",
        "Plan Rows",
        "Actual Rows",
        "Actual Loops",
        "Plans",
      ].includes(k)
    ) {
      details[k] = v;
    }
  }

  const children: ExplainPlanNode[] = [];
  if (Array.isArray(node["Plans"])) {
    for (const child of node["Plans"]) {
      if (typeof child === "object" && child !== null) {
        children.push(normalizePostgresNode(child as Record<string, unknown>));
      }
    }
  }

  return {
    id,
    type,
    relation,
    alias,
    estimatedCost,
    actualTimeMs,
    estimatedRows,
    actualRows,
    actualLoops,
    children,
    details,
  };
}

function normalizeMySQLQueryBlock(qb: Record<string, unknown>): ExplainPlanNode {
  const id = `node_${++nodeIdCounter}`;
  const selectId = qb["select_id"];
  const type = `Query Block (Select ${selectId ?? 1})`;
  const children: ExplainPlanNode[] = [];
  const details: Record<string, unknown> = {};

  let totalCost: number | undefined;
  if (qb["cost_info"] && typeof qb["cost_info"] === "object") {
    const ci = qb["cost_info"] as Record<string, unknown>;
    if (ci["query_cost"]) {
      totalCost = parseFloat(String(ci["query_cost"]));
    }
  }

  // Check ordering_operation, grouping_operation
  if (qb["ordering_operation"] && typeof qb["ordering_operation"] === "object") {
    const ord = qb["ordering_operation"] as Record<string, unknown>;
    children.push(normalizeMySQLOperationNode("Sort / Order", ord));
  } else if (qb["grouping_operation"] && typeof qb["grouping_operation"] === "object") {
    const grp = qb["grouping_operation"] as Record<string, unknown>;
    children.push(normalizeMySQLOperationNode("Group By", grp));
  } else if (qb["nested_loop"] && Array.isArray(qb["nested_loop"])) {
    for (const item of qb["nested_loop"]) {
      if (typeof item === "object" && item !== null) {
        children.push(normalizeMySQLTableNode(item as Record<string, unknown>));
      }
    }
  } else if (qb["table"] && typeof qb["table"] === "object") {
    children.push(normalizeMySQLTableNode(qb["table"] as Record<string, unknown>));
  }

  return {
    id,
    type,
    estimatedCost: totalCost !== undefined ? { total: totalCost } : undefined,
    children,
    details,
  };
}

function normalizeMySQLOperationNode(opName: string, opObj: Record<string, unknown>): ExplainPlanNode {
  const id = `node_${++nodeIdCounter}`;
  const children: ExplainPlanNode[] = [];
  if (opObj["table"] && typeof opObj["table"] === "object") {
    children.push(normalizeMySQLTableNode(opObj["table"] as Record<string, unknown>));
  }
  if (opObj["nested_loop"] && Array.isArray(opObj["nested_loop"])) {
    for (const item of opObj["nested_loop"]) {
      if (typeof item === "object" && item !== null) {
        children.push(normalizeMySQLTableNode(item as Record<string, unknown>));
      }
    }
  }

  return {
    id,
    type: opName,
    details: opObj,
    children,
  };
}

function normalizeMySQLTableNode(tableObj: Record<string, unknown>): ExplainPlanNode {
  const node = (tableObj["table"] && typeof tableObj["table"] === "object"
    ? tableObj["table"]
    : tableObj) as Record<string, unknown>;

  const id = `node_${++nodeIdCounter}`;
  const relation = node["table_name"] ? String(node["table_name"]) : undefined;
  const accessType = node["access_type"] ? String(node["access_type"]) : "Scan";
  const type = `Table ${accessType}`;

  let estimatedRows: number | undefined;
  if ("rows_examined_per_scan" in node) {
    estimatedRows = Number(node["rows_examined_per_scan"]);
  }

  let estimatedCost: ExplainCost | undefined;
  if (node["cost_info"] && typeof node["cost_info"] === "object") {
    const ci = node["cost_info"] as Record<string, unknown>;
    const readCost = ci["read_cost"] ? parseFloat(String(ci["read_cost"])) : 0;
    const evalCost = ci["eval_cost"] ? parseFloat(String(ci["eval_cost"])) : 0;
    const prefixCost = ci["prefix_cost"] ? parseFloat(String(ci["prefix_cost"])) : readCost + evalCost;
    estimatedCost = { total: prefixCost };
  }

  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!["table_name", "access_type", "rows_examined_per_scan", "cost_info"].includes(k)) {
      details[k] = v;
    }
  }

  return {
    id,
    type,
    relation,
    estimatedRows,
    estimatedCost,
    children: [],
    details,
  };
}

function normalizeGenericNode(obj: Record<string, unknown>): ExplainPlanNode {
  const id = `node_${++nodeIdCounter}`;
  const type = String(obj["type"] ?? obj["operation"] ?? obj["name"] ?? "Node");
  const relation = obj["table"] ? String(obj["table"]) : undefined;

  const children: ExplainPlanNode[] = [];
  if (Array.isArray(obj["children"])) {
    for (const c of obj["children"]) {
      if (typeof c === "object" && c !== null) {
        children.push(normalizeGenericNode(c as Record<string, unknown>));
      }
    }
  }

  return {
    id,
    type,
    relation,
    children,
    details: obj,
  };
}

export function getExplainPlanSummary(plan: NormalizedExplainPlan): ExplainPlanSummary {
  const tables = new Set<string>();
  const operations: Record<string, number> = {};
  let totalEstimatedCost = 0;
  let hasEstimatedCost = false;
  let totalActualTimeMs = 0;
  let hasActualTime = false;
  let nodeCount = 0;

  let maxCostNode: ExplainPlanSummary["maxCostNode"];
  let slowestNode: ExplainPlanSummary["slowestNode"];

  function traverse(node: ExplainPlanNode) {
    nodeCount++;
    operations[node.type] = (operations[node.type] ?? 0) + 1;

    if (node.relation) {
      tables.add(node.relation);
    }

    if (node.estimatedCost?.total !== undefined) {
      hasEstimatedCost = true;
      if (!maxCostNode || node.estimatedCost.total > maxCostNode.cost) {
        maxCostNode = {
          id: node.id,
          type: node.type,
          relation: node.relation,
          cost: node.estimatedCost.total,
        };
      }
    }

    if (node.actualTimeMs?.total !== undefined) {
      hasActualTime = true;
      if (!slowestNode || node.actualTimeMs.total > slowestNode.timeMs) {
        slowestNode = {
          id: node.id,
          type: node.type,
          relation: node.relation,
          timeMs: node.actualTimeMs.total,
        };
      }
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(plan.root);

  // In trees like Postgres, the root total cost is the total plan cost
  if (plan.root.estimatedCost?.total !== undefined) {
    totalEstimatedCost = plan.root.estimatedCost.total;
  } else if (hasEstimatedCost && maxCostNode) {
    totalEstimatedCost = maxCostNode.cost;
  }

  if (plan.root.actualTimeMs?.total !== undefined) {
    totalActualTimeMs = plan.root.actualTimeMs.total;
  } else if (hasActualTime && slowestNode) {
    totalActualTimeMs = slowestNode.timeMs;
  }

  return {
    dialect: plan.dialect,
    nodeCount,
    totalEstimatedCost: hasEstimatedCost ? totalEstimatedCost : undefined,
    totalActualTimeMs: hasActualTime ? totalActualTimeMs : undefined,
    tablesAccessed: Array.from(tables),
    operations,
    maxCostNode,
    slowestNode,
  };
}

export function formatExplainPlan(
  plan: NormalizedExplainPlan,
  options: ExplainFormatOptions = {}
): string {
  const {
    format = "ascii",
    showCost = true,
    showTiming = true,
    showRows = true,
  } = options;

  if (format === "json") {
    return JSON.stringify(plan.root, null, 2);
  }

  // ASCII tree rendering
  const lines: string[] = [];

  function renderNode(node: ExplainPlanNode, prefix: string, isLast: boolean, isRoot: boolean) {
    const marker = isRoot ? "" : isLast ? "└─ " : "├─ ";
    let text = `${prefix}${marker}${node.type}`;

    if (node.relation) {
      text += ` on ${node.relation}`;
    }
    if (node.alias && node.alias !== node.relation) {
      text += ` as ${node.alias}`;
    }

    const annotations: string[] = [];
    if (showCost && node.estimatedCost) {
      if (node.estimatedCost.startup !== undefined) {
        annotations.push(`cost=${node.estimatedCost.startup}..${node.estimatedCost.total}`);
      } else {
        annotations.push(`cost=${node.estimatedCost.total}`);
      }
    }
    if (showRows && node.estimatedRows !== undefined) {
      annotations.push(`rows=${node.estimatedRows}`);
    }
    if (showTiming && node.actualTimeMs) {
      annotations.push(`time=${node.actualTimeMs.total}ms`);
    }
    if (showRows && node.actualRows !== undefined) {
      annotations.push(`actual_rows=${node.actualRows}`);
    }

    if (annotations.length > 0) {
      text += ` (${annotations.join(" ")})`;
    }

    lines.push(text);

    const childPrefix = isRoot ? "" : prefix + (isLast ? "   " : "│  ");
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const childIsLast = i === node.children.length - 1;
      renderNode(child, childPrefix, childIsLast, false);
    }
  }

  renderNode(plan.root, "", true, true);
  return lines.join("\n");
}
