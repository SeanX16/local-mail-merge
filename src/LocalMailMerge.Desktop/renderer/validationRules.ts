import type { ValidationRuleId, ValidationRuleLevel } from './types';

export interface ValidationRuleDefinition {
  id: ValidationRuleId;
  name: string;
  description: string;
  fixed?: boolean;
}

export const validationLevelLabels: Record<ValidationRuleLevel, string> = {
  blocking: '拦截',
  warning: '警告',
  pass: '可创建'
};

export const validationRuleDefinitions: ValidationRuleDefinition[] = [
  {
    id: 'invalid_email',
    name: '邮箱无效',
    description: '邮箱为空、格式错误或仍为 Unknown。',
    fixed: true
  },
  {
    id: 'already_created',
    name: '重复创建',
    description: '相同批次、人员和内容已成功创建过草稿。'
  },
  {
    id: 'missing_subject',
    name: '主题为空',
    description: '邮件没有填写主题。'
  },
  {
    id: 'missing_body',
    name: '正文为空',
    description: 'HTML 正文和纯文本正文都没有内容。'
  },
  {
    id: 'unresolved_placeholder',
    name: '占位符残留',
    description: '主题或正文中仍有未替换的花括号占位符。'
  },
  {
    id: 'duplicate_email',
    name: '邮箱重复',
    description: '同一个邮箱在当前导入批次中出现多次。'
  },
  {
    id: 'review_not_approved',
    name: '尚未批准',
    description: '审核状态为空或不是 Approved／已批准／批准。'
  },
  {
    id: 'missing_personalization_source',
    name: '没有个性化事实',
    description: '邮件没有提供个性化事实信息。'
  },
  {
    id: 'content_hash_mismatch',
    name: '审核后内容发生变化',
    description: '仅在交接包提供内容哈希时检查邮箱、主题或正文变化。'
  }
];

const validationRuleTextByCode = new Map<string, Pick<ValidationRuleDefinition, 'name' | 'description'>>([
  ...validationRuleDefinitions.map((rule) => [rule.id, { name: rule.name, description: rule.description }] as const),
  ['duplicate_person', {
    name: '人员编号重复',
    description: '同一个导入批次中出现重复的人员编号，无法准确对应人员。'
  }]
]);

export function getValidationRuleText(code: string) {
  return validationRuleTextByCode.get(code);
}
