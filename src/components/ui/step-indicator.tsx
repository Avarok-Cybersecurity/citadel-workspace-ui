import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

export function StepIndicator({ currentStep, totalSteps, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 mt-1">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={step} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 min-w-[60px]">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                  isCompleted && "bg-success text-success-foreground",
                  isActive && "bg-primary text-primary-foreground ring-4 ring-ring/20",
                  !isCompleted && !isActive && "bg-card text-muted-foreground border border-surface"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" strokeWidth={3} /> : step}
              </div>
              {labels && labels[i] && (
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wider uppercase",
                    isActive && "text-primary-accent",
                    isCompleted && "text-success",
                    !isCompleted && !isActive && "text-muted-foreground"
                  )}
                >
                  {labels[i]}
                </span>
              )}
            </div>
            {/* Connector line */}
            {step < totalSteps && (
              <div
                className={cn(
                  "w-12 h-[2px] mx-1 rounded-full transition-colors duration-300",
                  step < currentStep ? "bg-success" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
