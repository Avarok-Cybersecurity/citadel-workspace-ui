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
                  isCompleted && "bg-green-500 text-white",
                  isActive && "bg-purple-500 text-white ring-4 ring-purple-500/20",
                  !isCompleted && !isActive && "bg-[#232536] text-gray-500 border border-[#3B3D57]"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" strokeWidth={3} /> : step}
              </div>
              {labels && labels[i] && (
                <span
                  className={cn(
                    "text-[10px] font-semibold tracking-wider uppercase",
                    isActive && "text-purple-300",
                    isCompleted && "text-green-400",
                    !isCompleted && !isActive && "text-gray-500"
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
                  step < currentStep ? "bg-green-500" : "bg-[#2D3548]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
