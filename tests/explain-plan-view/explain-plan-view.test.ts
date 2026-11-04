import { describe, it, expect } from "vitest";
import {
  parseExplainPlan,
  normalizeExplainPlan,
  formatExplainPlan,
  getExplainPlanSummary,
} from "../../src/explain-plan-view/index";
import { ValidationError, ParseError } from "../../src/shared/errors";

describe("EXPLAIN Plan View Utility", () => {
  const pgExplainJson = JSON.stringify([
    {
      Plan: {
        "Node Type": "Nested Loop",
        "Startup Cost": 0.29,
        "Total Cost": 35.5,
        "Plan Rows": 10,
        "Actual Startup Time": 0.015,
        "Actual Total Time": 0.12,
        "Actual Rows": 8,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Index Scan",
            "Relation Name": "users",
            Alias: "u",
            "Startup Cost": 0.15,
            "Total Cost": 8.17,
            "Plan Rows": 1,
            "Actual Total Time": 0.02,
            "Actual Rows": 1,
          },
          {
            "Node Type": "Seq Scan",
            "Relation Name": "orders",
            Alias: "o",
            "Startup Cost": 0.0,
            "Total Cost": 25.0,
            "Plan Rows": 10,
            "Actual Total Time": 0.09,
            "Actual Rows": 8,
          },
        ],
      },
    },
  ]);

  const mysqlExplainJson = JSON.stringify({
    query_block: {
      select_id: 1,
      cost_info: {
        query_cost: "12.50",
      },
      nested_loop: [
        {
          table: {
            table_name: "users",
            access_type: "ref",
            rows_examined_per_scan: 1,
            cost_info: {
              read_cost: "1.00",
              eval_cost: "0.20",
              prefix_cost: "1.20",
            },
          },
        },
        {
          table: {
            table_name: "orders",
            access_type: "ALL",
            rows_examined_per_scan: 100,
            cost_info: {
              read_cost: "10.00",
              eval_cost: "1.30",
              prefix_cost: "12.50",
            },
          },
        },
      ],
    },
  });

  it("parses and normalizes PostgreSQL EXPLAIN plan", () => {
    const plan = parseExplainPlan(pgExplainJson);
    expect(plan.dialect).toBe("postgres");
    expect(plan.root.type).toBe("Nested Loop");
    expect(plan.root.estimatedCost?.total).toBe(35.5);
    expect(plan.root.actualTimeMs?.total).toBe(0.12);
    expect(plan.root.children).toHaveLength(2);
    expect(plan.root.children[0].relation).toBe("users");
    expect(plan.root.children[1].relation).toBe("orders");
  });

  it("parses and normalizes MySQL EXPLAIN JSON plan", () => {
    const plan = parseExplainPlan(mysqlExplainJson);
    expect(plan.dialect).toBe("mysql");
    expect(plan.root.type).toContain("Query Block");
    expect(plan.root.estimatedCost?.total).toBe(12.5);
    expect(plan.root.children).toHaveLength(2);
    expect(plan.root.children[0].relation).toBe("users");
    expect(plan.root.children[1].relation).toBe("orders");
  });

  it("generates an explain plan summary", () => {
    const plan = parseExplainPlan(pgExplainJson);
    const summary = getExplainPlanSummary(plan);

    expect(summary.dialect).toBe("postgres");
    expect(summary.nodeCount).toBe(3);
    expect(summary.totalEstimatedCost).toBe(35.5);
    expect(summary.totalActualTimeMs).toBe(0.12);
    expect(summary.tablesAccessed).toContain("users");
    expect(summary.tablesAccessed).toContain("orders");
    expect(summary.maxCostNode?.type).toBe("Nested Loop");
    expect(summary.slowestNode?.type).toBe("Nested Loop");
  });

  it("formats plan as ASCII tree and JSON", () => {
    const plan = parseExplainPlan(pgExplainJson);
    const ascii = formatExplainPlan(plan, { format: "ascii" });
    expect(ascii).toContain("Nested Loop");
    expect(ascii).toContain("Index Scan on users");
    expect(ascii).toContain("Seq Scan on orders");

    const json = formatExplainPlan(plan, { format: "json" });
    expect(json).toContain('"type": "Nested Loop"');
  });

  it("handles missing execution statistics without fabricating them", () => {
    const noStats = normalizeExplainPlan({
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": "test",
      },
    });
    expect(noStats.root.estimatedCost).toBeUndefined();
    expect(noStats.root.actualTimeMs).toBeUndefined();
    expect(noStats.root.actualRows).toBeUndefined();
  });

  it("handles MySQL ordering_operation, grouping_operation and generic structures", () => {
    const orderPlan = normalizeExplainPlan({
      query_block: {
        select_id: 1,
        ordering_operation: {
          table: { table_name: "users", access_type: "ALL" },
        },
      },
    });
    expect(orderPlan.root.children[0].type).toBe("Sort / Order");

    const groupPlan = normalizeExplainPlan({
      query_block: {
        select_id: 1,
        grouping_operation: {
          table: { table_name: "logs", access_type: "ALL" },
        },
      },
    });
    expect(groupPlan.root.children[0].type).toBe("Group By");

    const genericPlan = normalizeExplainPlan({
      type: "CustomNode",
      table: "custom_tbl",
      children: [{ type: "ChildNode" }],
    });
    expect(genericPlan.dialect).toBe("unknown");
    expect(genericPlan.root.type).toBe("CustomNode");
  });

  it("throws ParseError or ValidationError on invalid inputs", () => {
    expect(() => parseExplainPlan("")).toThrow(ValidationError);
    expect(() => parseExplainPlan("{ invalid json")).toThrow(ParseError);
    expect(() => normalizeExplainPlan(null)).toThrow(ValidationError);
  });
});
