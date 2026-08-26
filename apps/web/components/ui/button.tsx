"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base styles
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium text-body-sm",
    "rounded-md transition-all duration-fast ease-smooth",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary",
    "disabled:pointer-events-none disabled:opacity-50",
    "min-h-[44px]", // Touch target for POS
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-accent-primary text-brand-contrast",
          "hover:bg-accent-primary-hover",
          "active:scale-[0.98]",
          "shadow-sm hover:shadow-md",
        ],
        secondary: [
          "bg-bg-elevated text-text-primary",
          "border border-border-default",
          "hover:bg-bg-surface hover:border-border-hover",
          "active:scale-[0.98]",
        ],
        ghost: [
          "bg-transparent text-text-secondary",
          "hover:bg-bg-surface hover:text-text-primary",
          "active:bg-bg-elevated",
        ],
        danger: [
          "bg-danger text-white",
          "hover:bg-danger/90",
          "active:scale-[0.98]",
          "shadow-sm",
        ],
        link: [
          "bg-transparent text-accent-primary",
          "hover:text-accent-primary-hover underline-offset-4 hover:underline",
          "p-0 h-auto min-h-0",
        ],
      },
      size: {
        sm: "h-9 px-3 text-body-sm",
        md: "h-11 px-4 text-body",
        lg: "h-12 px-6 text-body-lg",
        icon: "h-11 w-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    asChild = false, 
    loading = false,
    disabled,
    children,
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
