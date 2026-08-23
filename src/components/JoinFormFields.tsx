import { User, AtSign, Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import type { LucideIcon } from "lucide-react";

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  icon: LucideIcon;
  hint?: string;
}

function FormField({ id, name, label, value, onChange, placeholder, type, icon: Icon, hint }: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          className="bg-input border-border text-foreground pl-10 pr-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
          placeholder={placeholder}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/80 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && (
        <p className="text-[11px] text-muted-foreground pl-1">{hint}</p>
      )}
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score === 2) return { level: 2, label: 'Fair', color: 'bg-orange-500' };
    if (score === 3) return { level: 3, label: 'Good', color: 'bg-yellow-500' };
    return { level: 4, label: 'Strong', color: 'bg-green-500' };
  }, [password]);

  if (!password) return null;

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.level ? strength.color : 'bg-border'}`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${
        strength.level <= 1 ? 'text-red-400' :
        strength.level === 2 ? 'text-orange-400' :
        strength.level === 3 ? 'text-yellow-400' :
        'text-green-400'
      }`}>
        {strength.label}
      </span>
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
    <div className="space-y-4">
      <FormField
        id="fullName"
        name="fullName"
        label="Full Name"
        icon={User}
        value={formData.fullName}
        onChange={onChange}
        placeholder="John Doe"
      />
      <FormField
        id="username"
        name="username"
        label="Username"
        icon={AtSign}
        value={formData.username}
        onChange={onChange}
        placeholder="johndoe"
        hint={formData.username ? `Suggested: @${formData.username.toLowerCase().replace(/\s+/g, '_')}_citadel` : undefined}
      />
      <div>
        <FormField
          id="password"
          name="password"
          label="Profile Password"
          type="password"
          icon={Lock}
          value={formData.password}
          onChange={onChange}
          placeholder="••••••••••••"
        />
        <PasswordStrength password={formData.password} />
      </div>
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm Profile Password"
        type="password"
        icon={Lock}
        value={formData.confirmPassword}
        onChange={onChange}
        placeholder="••••••••••••"
      />
    </div>
  );
}
