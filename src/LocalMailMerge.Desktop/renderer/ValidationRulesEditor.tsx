import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  CircleCheck,
  CircleX,
  GripVertical,
  LockKeyhole,
  TriangleAlert
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ValidationPolicyState, ValidationRuleId, ValidationRuleLevel } from './types';
import {
  validationLevelLabels,
  validationRuleDefinitions,
  type ValidationRuleDefinition
} from './validationRules';

const levelMeta: Record<ValidationRuleLevel, {
  title: string;
  icon: typeof CircleX;
  tone: 'danger' | 'warning' | 'success';
}> = {
  blocking: {
    title: validationLevelLabels.blocking,
    icon: CircleX,
    tone: 'danger'
  },
  warning: {
    title: validationLevelLabels.warning,
    icon: TriangleAlert,
    tone: 'warning'
  },
  pass: {
    title: validationLevelLabels.pass,
    icon: CircleCheck,
    tone: 'success'
  }
};

export function ValidationRulesEditor({
  policy,
  onMoveRule
}: {
  policy: ValidationPolicyState;
  onMoveRule: (ruleId: ValidationRuleId, level: ValidationRuleLevel) => Promise<void>;
}) {
  const [busyRuleId, setBusyRuleId] = useState<ValidationRuleId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  async function moveRule(ruleId: ValidationRuleId, level: ValidationRuleLevel) {
    const rule = validationRuleDefinitions.find((item) => item.id === ruleId);
    if (!rule || rule.fixed || policy.rules[ruleId] === level || busyRuleId) return;
    setBusyRuleId(ruleId);
    try {
      await onMoveRule(ruleId, level);
    } finally {
      setBusyRuleId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const ruleId = event.active.id as ValidationRuleId;
    const level = event.over?.id as ValidationRuleLevel | undefined;
    if (level === 'blocking' || level === 'warning' || level === 'pass') {
      void moveRule(ruleId, level);
    }
  }

  return (
    <TooltipProvider delayDuration={260}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="validation-rules-grid">
          <RuleZone level="blocking" policy={policy} busyRuleId={busyRuleId} />
          <RuleZone level="warning" policy={policy} busyRuleId={busyRuleId} />
        </div>
        <RuleZone level="pass" policy={policy} busyRuleId={busyRuleId} />
      </DndContext>
    </TooltipProvider>
  );
}

function RuleZone({
  level,
  policy,
  busyRuleId
}: {
  level: ValidationRuleLevel;
  policy: ValidationPolicyState;
  busyRuleId: ValidationRuleId | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: level });
  const items = validationRuleDefinitions.filter((rule) => policy.rules[rule.id] === level);
  const meta = levelMeta[level];
  const Icon = meta.icon;

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      className={cn('validation-rule-zone', `validation-rule-zone--${level}`, isOver && 'is-drop-target')}
      data-rule-zone={level}
    >
      <CardHeader>
        <CardTitle>
          <Icon className="size-4" aria-hidden="true" />
          <span>{meta.title}</span>
          <Badge variant="glass" tone={meta.tone} size="counter" className="validation-rule-count">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="validation-rule-list">
          {items.map((rule) => (
            <RuleTag
              key={rule.id}
              rule={rule}
              busy={busyRuleId === rule.id}
              disabled={busyRuleId !== null}
            />
          ))}
          {!items.length ? <p className="validation-rule-empty">把规则拖到这里</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function RuleTag({
  rule,
  busy,
  disabled
}: {
  rule: ValidationRuleDefinition;
  busy: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: rule.id,
    disabled: rule.fixed || disabled
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('validation-rule-tag-wrap', isDragging && 'is-dragging', busy && 'is-saving')}
      data-rule-id={rule.id}
      data-rule-fixed={rule.fixed ? 'true' : undefined}
    >
      {rule.fixed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="glass"
              size="sm"
              className="validation-rule-tag"
            >
              <span tabIndex={0} role="note" aria-label={`${rule.name}，固定拦截，不能移动`}>
                <LockKeyhole data-icon="inline-start" aria-hidden="true" />
                {rule.name}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{rule.description} 此规则固定拦截，不能移动。</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="validation-rule-tag"
              disabled={disabled}
              aria-label={`拖动“${rule.name}”`}
              {...attributes}
              {...listeners}
            >
              <GripVertical data-icon="inline-start" aria-hidden="true" />
              {rule.name}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{rule.description}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
