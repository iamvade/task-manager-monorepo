export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Color classes per button variant (also used to style links as buttons). */
export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white enabled:hover:brightness-110 [a&]:hover:brightness-110',
  secondary:
    'border border-control bg-control text-default enabled:hover:bg-hover [a&]:hover:bg-hover',
  ghost: 'bg-transparent text-2 enabled:hover:bg-hover [a&]:hover:bg-hover',
};
