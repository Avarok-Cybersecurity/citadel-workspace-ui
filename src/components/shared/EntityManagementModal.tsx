import { useState, useEffect, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { debugLog } from '@/lib/debug-config';

export interface FieldConfig {
  id: string;
  label: string;
  type: 'input' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  /** Only show this field when mode is in this list. Omit to show in all modes. */
  showInModes?: string[];
}

export interface ModeConfig {
  title: string;
  description: string;
  submitLabel: string;
  submittingLabel: string;
  submitVariant?: 'default' | 'destructive';
}

export interface EntityManagementModalProps<TMode extends string> {
  isOpen: boolean;
  onClose: () => void;
  mode: TMode;
  modes: Record<TMode, ModeConfig>;
  fields: FieldConfig[];
  initialData?: Record<string, string>;
  onSubmit: (formData: Record<string, string>) => Promise<void>;
  customContent?: ReactNode;
  entityName: string;
}

function buildFormState(
  fields: FieldConfig[],
  initialData?: Record<string, string>,
): Record<string, string> {
  const state: Record<string, string> = {};
  for (const field of fields) {
    state[field.id] = initialData?.[field.id] ?? field.defaultValue ?? '';
  }
  return state;
}

export function EntityManagementModal<TMode extends string>({
  isOpen,
  onClose,
  mode,
  modes,
  fields,
  initialData,
  onSubmit,
  customContent,
  entityName,
}: EntityManagementModalProps<TMode>) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>(() =>
    buildFormState(fields, initialData)
  );

  useEffect(() => {
    if (isOpen) {
      setFormData(buildFormState(fields, initialData));
    }
    // Only re-sync when isOpen transitions; fields/initialData are stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const modeConfig = modes[mode];

  // Unguarded on purpose: onOpenChange is Radix's only dismissal channel, so
  // gating it on isSubmitting removed the X, Escape and outside-click at once.
  // Shared component, so that dead end reproduced at every call site.
  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const visibleFields = fields.filter(
      f => !f.showInModes || f.showInModes.includes(mode)
    );
    for (const field of visibleFields) {
      if (field.required && !formData[field.id]?.trim()) {
        toast({
          title: "Validation Error",
          description: `${field.label} is required`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      debugLog('EntityManagementModal', `Error managing ${entityName}:`, error);
      toast({
        title: "Error",
        description: `Failed to ${mode} ${entityName}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleFields = fields.filter(
    f => !f.showInModes || f.showInModes.includes(mode)
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-foreground">{modeConfig.title}</DialogTitle>
            <DialogDescription className="text-foreground/80">
              {modeConfig.description}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {visibleFields.map(field => (
              <EntityField
                key={field.id}
                field={field}
                value={formData[field.id] ?? ''}
                onChange={value => setFormData(prev => ({ ...prev, [field.id]: value }))}
                disabled={isSubmitting}
              />
            ))}
            {customContent}
          </div>
          <DialogFooter>
            {/* Not disabled while submitting: backing out of an in-flight
                request is always a legitimate thing to want, and greying this
                is what made the sealed dialog total. */}
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="bg-transparent border-border text-foreground hover:bg-card"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className={
                modeConfig.submitVariant === 'destructive'
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary-accent/20 text-primary-accent hover:bg-primary-accent/25 hover:text-primary-foreground"
              }
            >
              {isSubmitting ? modeConfig.submittingLabel : modeConfig.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EntityFieldProps {
  field: FieldConfig;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

function EntityField({ field, value, onChange, disabled }: EntityFieldProps) {
  switch (field.type) {
    case 'input':
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.id} className="text-foreground">{field.label}</Label>
          <Input
            id={field.id}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground"
            required={field.required}
            disabled={disabled}
          />
        </div>
      );
    case 'textarea':
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.id} className="text-foreground">{field.label}</Label>
          <Textarea
            id={field.id}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="bg-card border-border text-foreground placeholder:text-muted-foreground min-h-[100px]"
            disabled={disabled}
          />
        </div>
      );
    case 'select':
      return (
        <div className="grid gap-2">
          <Label htmlFor={field.id} className="text-foreground">{field.label}</Label>
          <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger className="bg-card border-border text-foreground">
              <SelectValue placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {field.options?.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-foreground hover:bg-card"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
  }
}
