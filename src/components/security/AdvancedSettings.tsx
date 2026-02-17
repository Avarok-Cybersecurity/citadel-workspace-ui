import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SecuritySettingsValues } from "../SecuritySettings";
import { Label } from "@/components/ui/label";
import {
  EncryptionAlgorithm,
  KemAlgorithm,
  SigAlgorithm
} from "@/types";
import { PskDialog } from "./PskDialog";

interface AdvancedSettingsProps {
  values: SecuritySettingsValues;
  onChange: <K extends keyof SecuritySettingsValues>(key: K, value: SecuritySettingsValues[K]) => void;
}

export const AdvancedSettings = ({ values, onChange }: AdvancedSettingsProps) => {
  const [showPSKDialog, setShowPSKDialog] = useState(false);
  const [psk, setPsk] = useState(values.headerObfuscatorSettings?.psk || "");

  const [obfuscatorUIMode, setObfuscatorUIMode] = useState<'off' | 'on' | 'psk'>(() => {
    if (!values.headerObfuscatorSettings || Object.keys(values.headerObfuscatorSettings).length === 0) {
      return 'off';
    }
    return values.headerObfuscatorSettings.psk ? 'psk' : 'on';
  });

  useEffect(() => {
    setPsk(values.headerObfuscatorSettings?.psk || "");
    setObfuscatorUIMode(() => {
      if (!values.headerObfuscatorSettings || Object.keys(values.headerObfuscatorSettings).length === 0) {
        return 'off';
      }
      return values.headerObfuscatorSettings.psk ? 'psk' : 'on';
    });
  }, [values.headerObfuscatorSettings]);

  const handleValueChange = <K extends keyof SecuritySettingsValues>(key: K, value: SecuritySettingsValues[K]) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  const handleHeaderObfuscatorChange = (uiMode: 'off' | 'on' | 'psk') => {
    setObfuscatorUIMode(uiMode);

    let newSettings: Record<string, string> = {};
    if (uiMode === 'on') {
      newSettings = { mode: 'enabled' };
      handleValueChange('headerObfuscatorSettings', newSettings);
    } else if (uiMode === 'psk') {
      newSettings = { mode: 'psk', psk: values.headerObfuscatorSettings?.psk || "" };
      handleValueChange('headerObfuscatorSettings', newSettings);
      if (!newSettings.psk) {
        setShowPSKDialog(true);
      }
    } else {
      handleValueChange('headerObfuscatorSettings', {});
    }
  };

  const handleSavePSK = () => {
    const newSettings = { ...values.headerObfuscatorSettings, mode: 'psk', psk: psk };
    handleValueChange('headerObfuscatorSettings', newSettings);
    setShowPSKDialog(false);
  };

  return (
    <div className="space-y-5">
      {/* Encryption Algorithm */}
      <div className="space-y-2">
        <Label htmlFor="encryption-algorithm" className="text-gray-300">
          Encryption Algorithm
        </Label>
        <div className="relative">
          <Select
            value={values.encryptionAlgorithm || 'AES_GCM_256'}
            onValueChange={(value: EncryptionAlgorithm) => handleValueChange('encryptionAlgorithm', value)}
            defaultValue={'AES_GCM_256'}
          >
            <SelectTrigger id="encryption-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select encryption algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value={'AES_GCM_256'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">AES 256 GCM</SelectItem>
              <SelectItem value={'ChaCha20Poly_1305'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">ChaCha20Poly1305</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                <p>Choose the encryption algorithm for your workspace</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* KEM Algorithm */}
      <div className="space-y-2">
        <Label htmlFor="kem-algorithm" className="text-gray-300">
          KEM Algorithm
        </Label>
        <div className="relative">
          <Select
            value={values.kemAlgorithm || 'MlKem'}
            onValueChange={(value: KemAlgorithm) => handleValueChange('kemAlgorithm', value)}
            defaultValue={'MlKem'}
          >
            <SelectTrigger id="kem-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select KEM algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value={'MlKem'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">ML-KEM</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                <p>Choose the key encapsulation mechanism (KEM)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Signing Algorithm */}
      <div className="space-y-2">
        <Label htmlFor="signing-algorithm" className="text-gray-300">
          Signing Algorithm
        </Label>
        <div className="relative">
          <Select
            value={values.sigAlgorithm || 'None'}
            onValueChange={(value: SigAlgorithm) => handleValueChange('sigAlgorithm', value)}
            defaultValue={'None'}
          >
            <SelectTrigger id="signing-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select signing algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value={'None'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">None</SelectItem>
              <SelectItem value={'MlDsa65'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">ML-DSA-65</SelectItem>
              <SelectItem value={'FnDsa512'} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">FN-DSA-512</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                <p>Choose the digital signature algorithm</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Header Obfuscator Mode */}
      <div className="space-y-2">
        <Label htmlFor="header-obfuscator" className="text-gray-300">
          Header Obfuscator Mode
        </Label>
        <div className="relative">
          <Select
            value={obfuscatorUIMode}
            onValueChange={handleHeaderObfuscatorChange}
            defaultValue={'off'}
          >
            <SelectTrigger id="header-obfuscator" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select header obfuscator mode" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value="off" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Off</SelectItem>
              <SelectItem value="on" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">On</SelectItem>
              <SelectItem value="psk" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">PSK</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="absolute right-12 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="bg-[#2A2438] border border-purple-400/30 text-white">
                <p>Configure header obfuscation settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* PSK Dialog */}
      <PskDialog
        open={showPSKDialog}
        onOpenChange={setShowPSKDialog}
        psk={psk}
        onPskChange={setPsk}
        onSave={handleSavePSK}
      />
    </div>
  );
};
