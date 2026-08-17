import type { BatchViewModel, FieldDefinition, MailRecord } from './types';

export const demoFields: FieldDefinition[] = [
  { key: 'recipient_name', label: '姓名', defaultVisible: true, width: 168 },
  { key: 'recipient_email', label: '邮箱', defaultVisible: true, width: 172 },
  { key: 'target_role', label: '目标岗位', defaultVisible: true, width: 164 },
  { key: 'organization', label: '机构', defaultVisible: true, width: 126 },
  { key: 'country', label: '国家/地区', defaultVisible: true, width: 118 },
  { key: 'review_status', label: '审核状态', defaultVisible: true, width: 112 },
  { key: '__validation', label: '校验结果', defaultVisible: true, width: 126 },
  { key: 'conference', label: '会议', defaultVisible: false, width: 142 },
  { key: 'paper_title', label: '论文标题', defaultVisible: false, width: 220 },
  { key: 'LinkedIn', label: 'LinkedIn', defaultVisible: false, width: 180 },
  { key: 'graduation_year', label: '毕业年份', defaultVisible: false, width: 112 },
  { key: 'source_url', label: '来源 URL', defaultVisible: false, width: 220 },
  { key: 'subject', label: '邮件主题', defaultVisible: false, width: 240 },
  { key: 'person_id', label: '人员 ID', defaultVisible: false, width: 190 }
];

const people = [
  ['James Anderson', 'james.anderson@example.test', 'Graphics & Spatial', 'Innovatech', '美国', '已批准', 'eligible'],
  ['Emily Brown', 'emily.brown@example.test', 'Video & Image', 'DataVision', '加拿大', '已批准', 'eligible'],
  ['Michael Chen', 'michael.chen@example.test', 'Audio Lab', 'NextGen Labs', '美国', '待复核', 'review'],
  ['Sarah Davis', 'sarah.davis@example.test', 'Data Science', 'PixelWorks', '英国', '未批准', 'review'],
  ['David Wilson', 'david.wilson@example.test', 'Platform Engineering', 'CloudScale', '德国', '已批准', 'eligible'],
  ['Jessica Taylor', 'jessica.taylor@example.test', 'UX Design', 'BrightFuture', '美国', '已批准', 'blocked'],
  ['Daniel Martinez', 'daniel.martinez@example.test', 'Sales', 'SalesForceX', '新加坡', '未批准', 'review'],
  ['Laura Garcia', 'laura.garcia@example.test', 'Graphics & Spatial', 'PeopleFirst', '西班牙', '待复核', 'review'],
  ['Robert Lee', 'robert.lee@example.test', 'Video & Image', 'FinOps Hub', '美国', '已批准', 'eligible'],
  ['Amanda White', 'amanda.white@example.test', 'Audio Lab', 'CarePlus', '澳大利亚', '已批准', 'blocked'],
  ['Christopher Hall', 'christopher.hall@example.test', 'Platform Engineering', 'SecureNet', '日本', '已批准', 'eligible'],
  ['Matthew King', 'matthew.king@example.test', 'Data Science', 'OpsCore', '美国', '未批准', 'review'],
  ['Nicole Wright', 'nicole.wright@example.test', 'UX Design', 'MarketLeap', '法国', '已批准', 'eligible'],
  ['Brandon Scott', 'brandon.scott@example.test', 'Sales', 'BizAnalytics', '美国', '待复核', 'review'],
  ['Olivia Green', 'olivia.green@example.test', 'Graphics & Spatial', 'CreativeCore', '荷兰', '已批准', 'eligible'],
  ['Tyler Adams', 'tyler.adams@example.test', 'Video & Image', 'SysAdmin Pro', '美国', '未批准', 'blocked']
] as const;

function makeRecord(person: (typeof people)[number], index: number): MailRecord {
  const [name, email, role, organization, country, reviewStatus, kind] = person;
  const emailInvalid = name === 'Jessica Taylor' || name === 'Amanda White' || name === 'Tyler Adams';
  const recipientEmail = emailInvalid ? 'Unknown' : email;
  const canCreate = kind === 'eligible' || kind === 'review';
  const validationText = emailInvalid ? '邮箱无效' : kind === 'eligible' ? '通过' : kind === 'review' ? '待人工确认' : '已拦截';
  const validationIssues = kind === 'eligible'
    ? []
    : emailInvalid
      ? [
          { code: 'invalid_email', message: '邮箱为空、格式错误或仍为 Unknown。', severity: 'blocking' as const },
          { code: 'missing_subject', message: '邮件没有填写主题。', severity: 'warning' as const }
        ]
      : [{ code: 'review_not_approved', message: '审核状态不是 Approved，请在发送前人工确认。', severity: 'warning' as const }];
  const firstName = name.split(' ')[0];
  const subject = emailInvalid ? '' : index === 0 ? 'Offer of Employment - Software Engineer' : `Research opportunity related to ${role}`;
  const bodyText = index === 0
    ? `Dear James Anderson,\n\nWe are pleased to extend an offer of employment for the position of Software Engineer at our company. We believe your skills and experience will be a great addition to our team.\n\nPlease review the attached offer letter for details regarding your compensation, benefits, and start date.\n\nKindly confirm your acceptance by replying to this email at your earliest convenience. If you have any questions, feel free to reach out to us.\n\nWe look forward to welcoming you aboard.`
    : `Dear ${firstName},\n\nYour public work is closely related to our current research direction. We would be glad to introduce our team and learn more about your interests.\n\nWould you be open to a short conversation?`;
  return {
    id: `demo-${index + 1}`,
    batchId: 'demo_batch_001',
    personId: `demo_${name.toLowerCase().replaceAll(' ', '_')}`,
    recipientName: name,
    recipientEmail,
    subject,
    bodyHtml: '',
    bodyText,
    targetRole: role,
    validationKind: kind,
    validationText,
    validationDetail: kind === 'eligible' ? '校验通过，可创建 Outlook 草稿。' : emailInvalid ? '收件人邮箱格式无效。' : '该记录含警告，但仍可由用户选择并创建草稿。',
    validationIssues,
    canCreate,
    initiallySelected: kind === 'eligible' && index < 14,
    values: {
      recipient_name: name,
      recipient_email: recipientEmail,
      target_role: role,
      organization,
      country,
      review_status: reviewStatus,
      __validation: validationText,
      conference: index % 2 === 0 ? 'SIGGRAPH 2025' : 'CVPR 2025',
      paper_title: `${role} Research Systems`,
      LinkedIn: `https://example.test/${firstName.toLowerCase()}`,
      graduation_year: String(2024 + (index % 4)),
      source_url: `https://example.test/source/${index + 1}`,
      subject,
      person_id: `demo_${name.toLowerCase().replaceAll(' ', '_')}`
    }
  };
}

export const demoBatch: BatchViewModel = {
  batchId: 'demo_batch_001',
  sourcePath: 'C:\\Data\\Handoff\\Q2_Transition_Handoff_20250515.json',
  fields: demoFields,
  records: people.map(makeRecord),
  aggregate: { total: 327, creatable: 312, eligible: 280, review: 32, blocked: 15, duplicate: 15, visible: 124 }
};
