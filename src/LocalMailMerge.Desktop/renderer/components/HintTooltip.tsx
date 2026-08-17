import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function HintTooltip({
  children,
  content,
  side = 'top'
}: {
  children: ReactElement;
  content: ReactNode;
  side?: ComponentProps<typeof TooltipContent>['side'];
}) {
  if (content === null || content === undefined || content === '') return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align="center" sideOffset={3}>{content}</TooltipContent>
    </Tooltip>
  );
}
