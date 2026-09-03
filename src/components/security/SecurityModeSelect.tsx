import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
// `Tooltip` requires an ancestor `<TooltipProvider>` to render. The
// app-level provider in `App.tsx` covers every route, so this
// component does not wrap its own — see `src/App.tsx` (`<TooltipProvider>`
// around the router). Removing that ancestor would silently break the
// tooltip on the help icon below.
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { SecrecyMode } from "@/types";

interface SecurityModeSelectProps {
  value?: SecrecyMode;
  onChange?: (value: SecrecyMode) => void;
}

export const SecurityModeSelect = ({ value = 'BestEffort', onChange }: SecurityModeSelectProps): JSX.Element => {
  const handleValueChange = (newValue: SecrecyMode): void => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="security-mode" className="text-foreground/80">
        Security Mode
      </Label>
      <div className="relative">
        <Select 
          value={value} 
          onValueChange={handleValueChange}
          defaultValue={'BestEffort'}
        >
          <SelectTrigger id="security-mode" className="w-full bg-surface border-border text-foreground pr-12">
            <SelectValue placeholder="Select security mode" />
          </SelectTrigger>
          <SelectContent className="bg-card border border-primary-accent/30 text-foreground shadow-xl p-1">
            <SelectItem value={'BestEffort'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Best Effort Secrecy</SelectItem>
            <SelectItem value={'Perfect'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Perfect Forward Secrecy</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="bg-card border border-primary-accent/30 text-foreground">
            <p>Choose your preferred security mode for encrypted communications</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};