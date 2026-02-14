import { HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  tooltip: string;
  placeholder?: string;
  type?: string;
}

function FormField({ id, name, label, value, onChange, tooltip, placeholder, type }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-gray-300">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          className="bg-[#3B3D57] border-[#4D4F6C] text-white pr-12"
          placeholder={placeholder}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

interface JoinFormFieldsProps {
  formData: {
    fullName: string;
    username: string;
    password: string;
    confirmPassword: string;
  };
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function JoinFormFields({ formData, onChange }: JoinFormFieldsProps) {
  return (
    <>
      <FormField
        id="fullName"
        name="fullName"
        label="Full Name"
        value={formData.fullName}
        onChange={onChange}
        tooltip="Enter your full name for this workspace profile"
        placeholder="John Doe"
      />
      <FormField
        id="username"
        name="username"
        label="Username"
        value={formData.username}
        onChange={onChange}
        tooltip="Choose a unique username for your workspace profile"
        placeholder="john.doe.33"
      />
      <FormField
        id="password"
        name="password"
        label="Profile Password"
        type="password"
        value={formData.password}
        onChange={onChange}
        tooltip="Create a strong password for your profile"
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm Profile Password"
        type="password"
        value={formData.confirmPassword}
        onChange={onChange}
        tooltip="Re-enter your password to confirm"
      />
    </>
  );
}
