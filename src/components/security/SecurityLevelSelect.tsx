import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";

interface SecurityLevelSelectProps {
  value?: string;
  onChange?: (value: string) => void;
}

export const SecurityLevelSelect = ({ value = "standard", onChange }: SecurityLevelSelectProps) => {
  const handleValueChange = (newValue: string) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="security-level" className="text-gray-300">
        Security Level
      </Label>
      <div className="relative">
        <Select 
          value={value} 
          onValueChange={handleValueChange}
          defaultValue="standard"
        >
          <SelectTrigger id="security-level" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white pr-12">
            <SelectValue placeholder="Select security level" />
          </SelectTrigger>
          <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-1">
            <SelectItem value="standard" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm">Standard</SelectItem>
            <SelectItem value="reinforced" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm">Reinforced</SelectItem>
            <SelectItem value="high" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm">High</SelectItem>
          </SelectContent>
        </Select>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
              <p>Select the security level for your workspace</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};