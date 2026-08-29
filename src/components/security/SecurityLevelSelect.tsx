import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
// `Tooltip` requires an ancestor `<TooltipProvider>` to render. The
// app-level provider in `App.tsx` covers every route, so this
// component does not wrap its own — see `src/App.tsx` (`<TooltipProvider>`
// around the router). Removing that ancestor would silently break the
// tooltip on the help icon below.
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { SecurityLevel } from "@/types";

interface SecurityLevelSelectProps {
  value?: SecurityLevel;
  onChange?: (value: SecurityLevel | string) => void;
}

export const SecurityLevelSelect = ({ value = 'Standard', onChange }: SecurityLevelSelectProps) => {
  const handleValueChange = (newValue: string): void => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="security-level" className="text-foreground/80">
        Security Level
      </Label>
      <div className="relative">
        <Select 
          value={typeof value === 'string' ? value : 'Standard'}
          onValueChange={handleValueChange}
          defaultValue={'Standard'}
        >
          <SelectTrigger id="security-level" className="w-full bg-surface border-border text-foreground pr-12">
            <SelectValue placeholder="Select security level" />
          </SelectTrigger>
          <SelectContent className="bg-card border border-primary-accent/30 text-foreground shadow-xl p-1">
            <SelectItem value={'Standard'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Standard</SelectItem>
            <SelectItem value={'Reinforced'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Reinforced</SelectItem>
            <SelectItem value={'High'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">High</SelectItem>
            <SelectItem value={'Extreme'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Extreme</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="bg-card border border-primary-accent/30 text-foreground">
            <p>Select the security level for your workspace</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};