import { useEffect, useMemo, useState } from 'react';
import type { ColumnOrderState, VisibilityState } from '@tanstack/react-table';
import {
  Check,
  ChevronDown,
  Filter,
  GripVertical,
  Plus,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel, FieldSet } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { HintTooltip } from '@/components/HintTooltip';
import { cn } from '@/lib/utils';
import type { FieldDefinition, MailRecord } from '../../types';

export interface CommandDropdownOption {
  id: string;
  label: string;
  description?: string;
}

export function MiddleEllipsisPath({ value }: { value: string }) {
  const slashIndex = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
  const directory = slashIndex >= 0 ? value.slice(0, slashIndex + 1) : '';
  const fileName = slashIndex >= 0 ? value.slice(slashIndex + 1) : value;

  return (
    <span className="path-copy">
      {directory ? <span className="path-directory">{directory}</span> : null}
      <span className="path-filename">{fileName}</span>
    </span>
  );
}

export function CommandDropdown({
  id,
  value,
  placeholder,
  options,
  disabled = false,
  defaultOpen = false,
  kind,
  onChange,
  action
}: {
  id: string;
  value: string;
  placeholder: string;
  options: CommandDropdownOption[];
  disabled?: boolean;
  defaultOpen?: boolean;
  kind: 'account' | 'signature';
  onChange: (id: string) => void;
  action?: { label: string; onSelect: () => void };
}) {
  const selected = options.find((option) => option.id === value);

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="command-select"
          data-testid={`${kind}-dropdown-trigger`}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="command-select-menu"
        aria-label={kind === 'account' ? '选择 Outlook 账户' : '选择邮件签名'}
        data-testid={`${kind}-dropdown-menu`}
      >
        <DropdownMenuLabel>{kind === 'account' ? 'Outlook 账户' : '邮件签名'}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.id}
              data-testid={`${kind}-dropdown-option`}
              onSelect={() => onChange(option.id)}
            >
              <span className="menu-check">{option.id === value ? <Check aria-hidden="true" /> : null}</span>
              <span className="menu-option-copy">
                <span className="truncate font-medium">{option.label}</span>
                {option.description && option.description !== option.label ? (
                  <span className="truncate text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {action ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem data-testid={`${kind}-dropdown-action`} onSelect={action.onSelect}>
                <Plus aria-hidden="true" />
                <span>{action.label}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ReviewBadge({ value }: { value: string }) {
  const approved = value.toLowerCase().includes('批准') && !value.toLowerCase().includes('未');
  return (
    <Badge variant="outline" className={cn('review-pill', approved ? 'is-approved' : 'is-review')}>
      {value}
    </Badge>
  );
}

export function ValidationBadge({ record }: { record: MailRecord }) {
  const tone = record.validationKind === 'eligible'
    ? 'eligible'
    : record.validationKind === 'review' && record.canCreate
      ? 'warning'
      : 'blocked';
  const label = tone === 'eligible' ? '可创建' : tone === 'warning' ? '警告' : '已拦截';
  const detail = [record.validationText, record.validationDetail].filter(Boolean).join('：');
  return (
    <HintTooltip content={detail}>
      <Badge variant="outline" className={`validation-pill validation-pill--${tone}`}>
        {label}
      </Badge>
    </HintTooltip>
  );
}

export function SummaryMetric({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="summary-metric" data-tone={tone}>
      <span className="summary-metric-icon">{icon}</span>
      <span className="summary-metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FieldManager({
  open,
  onOpenChange,
  fields,
  visibility,
  order,
  onVisibilityChange,
  onOrderChange,
  onReset
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldDefinition[];
  visibility: VisibilityState;
  order: ColumnOrderState;
  onVisibilityChange: (key: string, visible: boolean) => void;
  onOrderChange: (order: ColumnOrderState) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState('');
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const orderedFields = order
    .filter((key) => key !== '__select')
    .map((key) => fieldByKey.get(key))
    .filter(Boolean) as FieldDefinition[];
  const matches = (field: FieldDefinition) => field.label.toLowerCase().includes(query.trim().toLowerCase());
  const visibleFields = orderedFields.filter((field) => visibility[field.key] !== false && matches(field));
  const hiddenFields = orderedFields.filter((field) => visibility[field.key] === false && matches(field));

  function dropBefore(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) return;
    const next = [...order];
    const from = next.indexOf(draggedKey);
    const to = next.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, draggedKey);
    onOrderChange(next);
    setDraggedKey(null);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" pressFeedback className="field-button" aria-expanded={open}>
          <SlidersHorizontal data-icon="inline-start" />
          字段
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="field-manager p-0">
        <PopoverHeader className="compact-popover-header">
          <PopoverTitle>显示字段</PopoverTitle>
          <span>{visibleFields.length} / {fields.length}</span>
        </PopoverHeader>
        <div className="compact-popover-search">
          <InputGroup className="compact-search-input">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段" />
          </InputGroup>
        </div>
        <Separator />
        <ScrollArea className="field-list-scroll">
          <div className="field-list-section">
            <p className="field-list-label">已显示 · 可拖动排序</p>
            <FieldSet>
              {visibleFields.map((field) => (
                <Field
                  key={field.key}
                  orientation="horizontal"
                  draggable
                  onDragStart={() => setDraggedKey(field.key)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropBefore(field.key)}
                >
                  <Checkbox
                    id={`visible-${field.key}`}
                    checked
                    onCheckedChange={(checked) => onVisibilityChange(field.key, checked === true)}
                  />
                  <FieldLabel htmlFor={`visible-${field.key}`}>{field.label}</FieldLabel>
                  <GripVertical className="drag-handle" aria-label="拖动排序" />
                </Field>
              ))}
            </FieldSet>
          </div>
          <Separator />
          <div className="field-list-section">
            <p className="field-list-label">已隐藏</p>
            <FieldSet>
              {hiddenFields.map((field) => (
                <Field key={field.key} orientation="horizontal">
                  <Checkbox
                    id={`hidden-${field.key}`}
                    checked={false}
                    onCheckedChange={(checked) => onVisibilityChange(field.key, checked === true)}
                  />
                  <FieldLabel htmlFor={`hidden-${field.key}`}>{field.label}</FieldLabel>
                </Field>
              ))}
            </FieldSet>
          </div>
        </ScrollArea>
        <Separator />
        <div className="popover-actions">
          <Button variant="ghost" size="sm" onClick={onReset}>恢复默认</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>完成</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ColumnFilterMenu({
  fieldKey,
  label,
  values,
  appliedValues,
  defaultOpen = false,
  onApply
}: {
  fieldKey: string;
  label: string;
  values: string[];
  appliedValues: string[] | undefined;
  defaultOpen?: boolean;
  onApply: (values: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set(appliedValues ?? values));

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(appliedValues ?? values));
    setQuery('');
  }, [open, appliedValues, values]);

  const filtered = values.filter((value) => value.toLowerCase().includes(query.trim().toLowerCase()));
  const allSelected = selected.size === values.length;

  function toggle(value: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(value); else next.delete(value);
      return next;
    });
  }

  function apply() {
    onApply(selected.size === values.length ? undefined : [...selected]);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          pressFeedback
          className={cn('column-filter-button', appliedValues?.length && 'is-active')}
          data-filter-id={fieldKey}
          aria-label={`筛选${label}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Filter aria-hidden="true" />
          {appliedValues?.length ? <span className="filter-count">{appliedValues.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={5} className="filter-popover p-0">
        <div className="compact-popover-header filter-title-row">
          <strong>{label}</strong>
          <span>{selected.size} / {values.length}</span>
        </div>
        <div className="compact-popover-search">
          <InputGroup className="compact-search-input">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索值" />
          </InputGroup>
        </div>
        <Separator />
        <div className="filter-all-section">
          <div className="filter-all-row">
            <Checkbox
              id={`filter-all-${fieldKey}`}
              checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
              onCheckedChange={(checked) => setSelected(checked === true ? new Set(values) : new Set())}
            />
            <FieldLabel htmlFor={`filter-all-${fieldKey}`}>全选当前字段</FieldLabel>
          </div>
        </div>
        <Separator className="filter-master-separator" />
        <ScrollArea className="filter-options">
          {filtered.length ? (
            <FieldSet className="filter-option-list">
              {filtered.map((value) => (
                <Field key={value} orientation="horizontal">
                  <Checkbox
                    id={`filter-${fieldKey}-${value}`}
                    checked={selected.has(value)}
                    onCheckedChange={(checked) => toggle(value, checked === true)}
                  />
                  <FieldLabel htmlFor={`filter-${fieldKey}-${value}`} className="truncate">{value}</FieldLabel>
                </Field>
              ))}
            </FieldSet>
          ) : (
            <Empty className="border-0 py-5">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Search /></EmptyMedia>
                <EmptyTitle>没有匹配项</EmptyTitle>
                <EmptyDescription>换一个关键词试试。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
        <Separator />
        <div className="filter-footer">
          <Button variant="ghost" size="sm" onClick={() => { onApply(undefined); setOpen(false); }}>清除</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" onClick={apply}>应用</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
