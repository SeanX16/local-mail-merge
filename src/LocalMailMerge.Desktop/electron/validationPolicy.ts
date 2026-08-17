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
}

const defaultRules: Record<ValidationRuleId, ValidationRuleLevel> = {
  invalid_email: 'blocking',
  already_created: 'blocking',
  missing_subject: 'warning',
  missing_body: 'warning',
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

export function getValidationPolicy(): ValidationPolicyState {
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath(), 'utf8')) as { rules?: unknown };
    return { version: 1, rules: normalizeRules(parsed?.rules) };
  } catch {
    return { version: 1, rules: { ...defaultRules } };
  }
}

export function saveValidationPolicy(value: unknown): ValidationPolicyState {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const state: ValidationPolicyState = { version: 1, rules: normalizeRules(record.rules) };
  const destination = policyPath();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(state, null, 2), 'utf8');
  return state;
}
