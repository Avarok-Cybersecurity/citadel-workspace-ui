import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpHint } from "@/components/shared/HelpHint";
import { Label } from "@/components/ui/label";
import { SecurityLevel } from "@/types";

interface SecurityLevelSelectProps {
  value?: SecurityLevel;
  onChange?: (value: SecurityLevel | string) => void;
}

export const SecurityLevelSelect = ({ value = 'Standard', onChange }: SecurityLevelSelectProps): JSX.Element => {
  const handleValueChange = (newValue: string): void => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label htmlFor="security-level" className="text-foreground/80">
          Security Level
        </Label>
        <HelpHint topic="Security Level">Select the security level for your workspace</HelpHint>
      </div>
      <div className="relative">
        <Select 
          value={typeof value === 'string' ? value : 'Standard'}
          onValueChange={handleValueChange}
          defaultValue={'Standard'}
        >
          <SelectTrigger id="security-level" className="w-full bg-surface text-foreground">
            <SelectValue placeholder="Select security level" />
          </SelectTrigger>
          <SelectContent className="bg-card border border-primary-accent/30 text-foreground shadow-xl p-1">
            <SelectItem value={'Standard'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Standard</SelectItem>
            <SelectItem value={'Reinforced'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Reinforced</SelectItem>
            <SelectItem value={'High'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">High</SelectItem>
            <SelectItem value={'Extreme'} className="hover:bg-primary-accent/20 focus:bg-primary-accent/20 rounded-sm">Extreme</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};