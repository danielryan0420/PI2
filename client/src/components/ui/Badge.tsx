import { cn } from '../../lib/utils';

type BadgeVariant = 'pending' | 'verified' | 'flagged' | 'default' | 'variance' | 'not_counted';

const variants: Record<BadgeVariant, string> = {
  pending: 'bg-blue-100 text-blue-800',
  verified: 'bg-green-100 text-green-800',
  flagged: 'bg-red-100 text-red-800',
  variance: 'bg-orange-100 text-orange-800',
  not_counted: 'bg-gray-100 text-gray-600',
  default: 'bg-gray-100 text-gray-700',
};

const labels: Partial<Record<BadgeVariant, string>> = {
  not_counted: 'Not Counted',
  pending: 'Pending',
  verified: 'Verified',
  flagged: 'Flagged',
  variance: 'Variance',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children ?? labels[variant] ?? variant}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const v = (['pending', 'verified', 'flagged', 'variance', 'not_counted'] as BadgeVariant[]).includes(status as BadgeVariant)
    ? (status as BadgeVariant)
    : 'default';
  return <Badge variant={v} />;
}
