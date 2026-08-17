import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const validationRuleIds = [
  'invalid_email',
  'already_created',
  'missing_subject',
  'missing_body',
  'unresolved_placeholder',
  'duplicate_email',
  'review_not_approved',
  'missing_personalization_source',
  'content_hash_mismatch'
] as const;

export type ValidationRuleId = typeof validationRuleIds[number];
export type ValidationRuleLevel = 'blocking' | 'warning' | 'pass';

export interface ValidationPolicyState {
  version: 1;
  rules: Record<ValidationRuleId, ValidationRuleLevel>;
  order: ValidationRuleId[];
}

const defaultRules: Record<ValidationRuleId, ValidationRuleLevel> = {
  invalid_email: 'blocking',
  already_created: 'blocking',
  missing_subject: 'blocking',
  missing_body: 'blocking',
  unresolved_placeholder: 'warning',
  duplicate_email: 'warning',
  review_not_approved: 'pass',
  missing_personalization_source: 'pass',
  content_hash_mismatch: 'pass'
};

function policyPath(): string {
  return path.join(app.getPath('userData'), 'validation-rules.json');
}

function normalizeRules(value: unknown): Record<ValidationRuleId, ValidationRuleLevel> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rules = { ...defaultRules };
  for (const id of validationRuleIds) {
    const level = source[id];
    if (level === 'blocking' || level === 'warning' || level === 'pass') rules[id] = level;
  }
  rules.invalid_email = 'blocking';
  return rules;
}

function normalizeOrder(value: unknown): ValidationRuleId[] {
  const order: ValidationRuleId[] = [];
  const seen = new Set<ValidationRuleId>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !validationRuleIds.includes(item as ValidationRuleId)) continue;
      const ruleId = item as ValidationRuleId;
      if (seen.has(ruleId)) continue;
      seen.add(ruleId);
      order.push(ruleId);
    }
  }
  for (const ruleId of validationRuleIds) {
    if (!seen.has(ruleId)) order.push(ruleId);
  }
  return order;
}

export function getValidationPolicy(): ValidationPolicyState {
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath(), 'utf8')) as { rules?: unknown; order?: unknown };
    return { version: 1, rules: normalizeRules(parsed?.rules), order: normalizeOrder(parsed?.order) };
  } catch {
    return { version: 1, rules: { ...defaultRules }, order: [...validationRuleIds] };
  }
}

export function saveValidationPolicy(value: unknown): ValidationPolicyState {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const state: ValidationPolicyState = { version: 1, rules: normalizeRules(record.rules), order: normalizeOrder(record.order) };
  const destination = policyPath();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(state, null, 2), 'utf8');
  return state;
}
