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

export const SecurityModeSelect = ({ value = 'BestEffort', onChange }: SecurityModeSelectProps) => {
  const handleValueChange = (newValue: SecrecyMode) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="security-mode" className="text-gray-300">
        Security Mode
      </Label>
      <div className="relative">
        <Select 
          value={value} 
          onValueChange={handleValueChange}
          defaultValue={'BestEffort'}
        >
          <SelectTrigger id="security-mode" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white pr-12">
            <SelectValue placeholder="Select security mode" />
          </SelectTrigger>
          <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-1">
            <SelectItem value={'BestEffort'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm">Best Effort Secrecy</SelectItem>
            <SelectItem value={'Perfect'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm">Perfect Forward Secrecy</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
            <p>Choose your preferred security mode for encrypted communications</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};