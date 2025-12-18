import { z } from "zod";
import crypto from "crypto";

// Rule schemas for Zod validation
const allowlistRuleSchema = z.object({
  type: z.literal("ALLOWLIST"),
  userIds: z.array(z.string()),
});

const percentRolloutRuleSchema = z.object({
  type: z.literal("PERCENT_ROLLOUT"),
  percentage: z.number().min(0).max(100),
});

const andRuleSchema = z.object({
  type: z.literal("AND"),
  rules: z.array(z.lazy(() => ruleSchema)),
});

const orRuleSchema = z.object({
  type: z.literal("OR"),
  rules: z.array(z.lazy(() => ruleSchema)),
});

export const ruleSchema: z.ZodType<Rule> = z.discriminatedUnion("type", [
  allowlistRuleSchema,
  percentRolloutRuleSchema,
  z.object({
    type: z.literal("AND"),
    rules: z.array(z.lazy(() => ruleSchema)),
  }),
  z.object({
    type: z.literal("OR"),
    rules: z.array(z.lazy(() => ruleSchema)),
  }),
]);

export type AllowlistRule = z.infer<typeof allowlistRuleSchema>;
export type PercentRolloutRule = z.infer<typeof percentRolloutRuleSchema>;
export type AndRule = { type: "AND"; rules: Rule[] };
export type OrRule = { type: "OR"; rules: Rule[] };
export type Rule = AllowlistRule | PercentRolloutRule | AndRule | OrRule;

export interface EvaluationContext {
  userId: string;
  environment: string;
  service?: string;
}

export interface EvaluationResult {
  enabled: boolean;
  reason: string;
  trace: string[];
}

/**
 * Stable hash function for deterministic percentage rollout
 * Uses SHA-256 to hash userId + flagKey and converts to a number 0-99
 */
export function stableHash(userId: string, flagKey: string): number {
  const hash = crypto.createHash("sha256");
  hash.update(`${userId}:${flagKey}`);
  const hex = hash.digest("hex");
  // Take first 8 characters and convert to number, then mod 100
  const num = parseInt(hex.substring(0, 8), 16);
  return num % 100;
}

/**
 * Evaluate a single rule
 */
function evaluateRule(
  rule: Rule,
  context: EvaluationContext,
  flagKey: string,
  trace: string[]
): boolean {
  switch (rule.type) {
    case "ALLOWLIST": {
      const result = rule.userIds.includes(context.userId);
      trace.push(
        `ALLOWLIST: userId "${context.userId}" ${result ? "is" : "is not"} in list [${rule.userIds.join(", ")}]`
      );
      return result;
    }

    case "PERCENT_ROLLOUT": {
      const bucket = stableHash(context.userId, flagKey);
      const result = bucket < rule.percentage;
      trace.push(
        `PERCENT_ROLLOUT: userId "${context.userId}" hashes to bucket ${bucket}, threshold is ${rule.percentage}% -> ${result ? "enabled" : "disabled"}`
      );
      return result;
    }

    case "AND": {
      trace.push(`AND: Evaluating ${rule.rules.length} sub-rules...`);
      const results = rule.rules.map((subRule) =>
        evaluateRule(subRule, context, flagKey, trace)
      );
      const result = results.every(Boolean);
      trace.push(`AND: All sub-rules ${result ? "passed" : "did not pass"}`);
      return result;
    }

    case "OR": {
      trace.push(`OR: Evaluating ${rule.rules.length} sub-rules...`);
      const results = rule.rules.map((subRule) =>
        evaluateRule(subRule, context, flagKey, trace)
      );
      const result = results.some(Boolean);
      trace.push(`OR: At least one sub-rule ${result ? "passed" : "did not pass"}`);
      return result;
    }

    default:
      trace.push(`Unknown rule type, defaulting to false`);
      return false;
  }
}

/**
 * Evaluate a feature flag for a given context
 */
export function evaluateFeatureFlag(
  flag: {
    key: string;
    enabled: boolean;
    environment: string;
    rules: { condition: unknown }[];
  },
  context: EvaluationContext
): EvaluationResult {
  const trace: string[] = [];

  // Check if flag is globally disabled
  if (!flag.enabled) {
    trace.push(`Flag "${flag.key}" is globally disabled`);
    return {
      enabled: false,
      reason: "Flag is globally disabled",
      trace,
    };
  }

  // Check environment match
  if (flag.environment !== context.environment) {
    trace.push(
      `Flag environment "${flag.environment}" does not match context environment "${context.environment}"`
    );
    return {
      enabled: false,
      reason: `Environment mismatch: flag is for ${flag.environment}, context is ${context.environment}`,
      trace,
    };
  }

  trace.push(`Flag "${flag.key}" is enabled for environment "${flag.environment}"`);

  // If no rules, flag is enabled for all
  if (!flag.rules || flag.rules.length === 0) {
    trace.push("No rules defined, flag is enabled for all users");
    return {
      enabled: true,
      reason: "No rules defined, enabled for all",
      trace,
    };
  }

  // Evaluate rules in order (first matching rule wins)
  trace.push(`Evaluating ${flag.rules.length} rule(s)...`);

  for (let i = 0; i < flag.rules.length; i++) {
    const rule = flag.rules[i];
    trace.push(`\nRule ${i + 1}:`);

    try {
      const parsedRule = ruleSchema.parse(rule.condition);
      const result = evaluateRule(parsedRule, context, flag.key, trace);

      if (result) {
        return {
          enabled: true,
          reason: `Matched rule ${i + 1}`,
          trace,
        };
      }
    } catch (error) {
      trace.push(`Rule ${i + 1} failed to parse: ${error}`);
    }
  }

  trace.push("No rules matched, flag is disabled for this user");
  return {
    enabled: false,
    reason: "No rules matched",
    trace,
  };
}

/**
 * Validate a rule condition
 */
export function validateRule(condition: unknown): { valid: boolean; error?: string } {
  try {
    ruleSchema.parse(condition);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0].message };
    }
    return { valid: false, error: "Invalid rule format" };
  }
}
