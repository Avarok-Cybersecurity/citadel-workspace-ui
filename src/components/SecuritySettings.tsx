import { Button } from "@/components/ui/button";
import { Shield, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SecurityLevelSelect } from "./security/SecurityLevelSelect";
import { SecurityModeSelect } from "./security/SecurityModeSelect";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AdvancedSettings } from "./security/AdvancedSettings";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SecurityLevel,
  SecrecyMode,
  EncryptionAlgorithm,
  KemAlgorithm,
  SigAlgorithm
} from "@/types";

export interface SecuritySettingsValues {
  securityLevel: SecurityLevel;
  secrecyMode: SecrecyMode;
  encryptionAlgorithm: EncryptionAlgorithm;
  kemAlgorithm: KemAlgorithm;
  sigAlgorithm: SigAlgorithm;
  headerObfuscatorSettings: Record<string, string>;
  storeCredentials?: boolean;
}

interface SecuritySettingsProps {
  onNext: () => void;
  onBack: () => void;
  onComplete?: (settings: SecuritySettingsValues) => void;
  initialValues?: SecuritySettingsValues;
  isFromLogin?: boolean; // Flag to indicate if this is accessed from login flow
}

export const SecuritySettings = ({
  onNext,
  onBack,
  onComplete,
  initialValues,
  isFromLogin = false
}: SecuritySettingsProps) => {
  const navigate = useNavigate();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SecuritySettingsValues>({
    securityLevel: 'Standard',
    secrecyMode: 'BestEffort',
    encryptionAlgorithm: 'AES_GCM_256',
    kemAlgorithm: 'MlKem',
    sigAlgorithm: 'None',
    headerObfuscatorSettings: {},
    storeCredentials: false,
  });

  // Initialize settings with provided initialValues if available
  useEffect(() => {
    if (initialValues) {
      setSettings(prev => ({
        ...prev,
        ...initialValues
      }));
    }
  }, [initialValues]);

  const { mutate: updateSecuritySettings } = useMutation({
    mutationFn: (newSettings: SecuritySettingsValues) => {
      console.info('Updating security settings:', JSON.stringify(newSettings));
      return Promise.resolve(newSettings);
    },
    onSuccess: (updatedSettings) => {
      // Save the security settings to query cache
      queryClient.setQueryData(['securitySettings'], updatedSettings);

      // If onComplete is provided, call it with the current settings
      if (onComplete) {
        onComplete(updatedSettings);
      } else {
        onNext();
      }
    },
  });

  const handleNext = () => {
    // Update the security settings and let the onSuccess handler navigate
    updateSecuritySettings(settings);
  };

  const handleSettingChange = (key: keyof SecuritySettingsValues, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl">
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg">
          <CardHeader>
            <CardTitle className="text-white text-xl">Security Settings</CardTitle>
            <CardDescription className="text-gray-300">
              Configure security settings for your workspace connection
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 max-h-[calc(100vh-16rem)] overflow-y-auto scrollbar-visible">
            <SecurityLevelSelect
              value={settings.securityLevel}
              onChange={(value) => handleSettingChange('securityLevel', value)}
            />

            <SecurityModeSelect
              value={settings.secrecyMode}
              onChange={(value) => handleSettingChange('secrecyMode', value)}
            />

            <div className="space-y-2">
              <button
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="flex items-center text-white space-x-2 w-full transition-colors duration-200 hover:text-purple-300"
              >
                <span className="text-lg font-semibold">ADVANCED SETTINGS</span>
                <ChevronDown
                  className={cn(
                    "w-5 h-5 transition-transform duration-300",
                    isAdvancedOpen && "rotate-180"
                  )}
                />
              </button>

              {isAdvancedOpen && (
                <div className="pt-4 space-y-4">
                  <AdvancedSettings
                    values={settings}
                    onChange={handleSettingChange}
                  />
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className="text-white hover:bg-purple-500/20"
            >
              BACK
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              {isFromLogin ? "SAVE" : "NEXT"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
