import { useCallback, useState } from 'react';
import {
  closestCenter,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  onMoveRule: (ruleId: ValidationRuleId, level: ValidationRuleLevel, targetRuleId?: ValidationRuleId, edge?: 'before' | 'after') => Promise<void>;
}) {
  const [busyRuleId, setBusyRuleId] = useState<ValidationRuleId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  async function moveRule(
    ruleId: ValidationRuleId,
    level: ValidationRuleLevel,
    targetRuleId?: ValidationRuleId,
    edge?: 'before' | 'after'
  ) {
    const rule = validationRuleDefinitions.find((item) => item.id === ruleId);
    if (!rule || rule.fixed || targetRuleId === ruleId || busyRuleId) return;
    setBusyRuleId(ruleId);
    try {
      await onMoveRule(ruleId, level, targetRuleId, edge);
    } finally {
      setBusyRuleId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const ruleId = event.active.id as ValidationRuleId;
    const dropData = event.over?.data.current as { type?: 'zone' | 'rule'; level?: ValidationRuleLevel; ruleId?: ValidationRuleId } | undefined;
    if (!dropData?.level) return;
    if (dropData.type === 'zone') {
      void moveRule(ruleId, dropData.level);
      return;
    }
    if (dropData.type !== 'rule' || !dropData.ruleId || dropData.ruleId === ruleId || !event.over) return;
    const activeRect = event.active.rect.current.translated;
    const overRect = event.over.rect;
    const activeCenterX = activeRect ? activeRect.left + activeRect.width / 2 : overRect.left;
    const activeCenterY = activeRect ? activeRect.top + activeRect.height / 2 : overRect.top;
    const overCenterX = overRect.left + overRect.width / 2;
    const overCenterY = overRect.top + overRect.height / 2;
    const onDifferentRow = Math.abs(activeCenterY - overCenterY) > overRect.height / 2;
    const edge = (onDifferentRow ? activeCenterY > overCenterY : activeCenterX > overCenterX) ? 'after' : 'before';
    void moveRule(ruleId, dropData.level, dropData.ruleId, edge);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="validation-rules-grid">
        <RuleZone level="blocking" policy={policy} busyRuleId={busyRuleId} />
        <RuleZone level="warning" policy={policy} busyRuleId={busyRuleId} />
      </div>
      <RuleZone level="pass" policy={policy} busyRuleId={busyRuleId} />
    </DndContext>
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
  const { setNodeRef, isOver } = useDroppable({ id: level, data: { type: 'zone', level } });
  const items = policy.order
    .map((ruleId) => validationRuleDefinitions.find((rule) => rule.id === ruleId))
    .filter((rule): rule is ValidationRuleDefinition => rule !== undefined && policy.rules[rule.id] === level);
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
              level={level}
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
  level,
  busy,
  disabled
}: {
  rule: ValidationRuleDefinition;
  level: ValidationRuleLevel;
  busy: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
    id: rule.id,
    disabled: rule.fixed || disabled
  });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `rule:${rule.id}`,
    data: { type: 'rule', level, ruleId: rule.id }
  });
  const setNodeRef = useCallback((node: HTMLDivElement | null) => {
    setDraggableRef(node);
    setDroppableRef(node);
  }, [setDraggableRef, setDroppableRef]);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('validation-rule-tag-wrap', isDragging && 'is-dragging', isOver && !isDragging && 'is-drop-target', busy && 'is-saving')}
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
