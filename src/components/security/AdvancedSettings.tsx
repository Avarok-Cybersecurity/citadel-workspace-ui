import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SecuritySettingsValues } from "../SecuritySettings";
import { Label } from "@/components/ui/label";
import {
  EncryptionAlgorithm,
  KemAlgorithm,
  SigAlgorithm
} from "@/types"; // Adjust path if necessary

interface AdvancedSettingsProps {
  values: SecuritySettingsValues; // values is required now
  onChange: (key: keyof SecuritySettingsValues, value: any) => void; // onChange is required now
}

export const AdvancedSettings = ({ values, onChange }: AdvancedSettingsProps) => {
  // State for PSK dialog, derive initial PSK from props if available
  const [showPSKDialog, setShowPSKDialog] = useState(false);
  const [psk, setPsk] = useState(values.headerObfuscatorSettings?.psk || "");

  // Local state to manage the selected obfuscator mode for the UI
  const [obfuscatorUIMode, setObfuscatorUIMode] = useState<'off' | 'on' | 'psk'>(() => {
    if (!values.headerObfuscatorSettings || Object.keys(values.headerObfuscatorSettings).length === 0) {
      return 'off';
    }
    return values.headerObfuscatorSettings.psk ? 'psk' : 'on';
  });

  // Update internal PSK state if the prop changes
  useEffect(() => {
    setPsk(values.headerObfuscatorSettings?.psk || "");
    // Update UI mode based on settings
    setObfuscatorUIMode(() => {
      if (!values.headerObfuscatorSettings || Object.keys(values.headerObfuscatorSettings).length === 0) {
        return 'off';
      }
      return values.headerObfuscatorSettings.psk ? 'psk' : 'on';
    });
  }, [values.headerObfuscatorSettings]);

  // Simplified handler
  const handleValueChange = (key: keyof SecuritySettingsValues, value: any) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  // Handle changes in the Header Obfuscator Select component
  const handleHeaderObfuscatorChange = (uiMode: 'off' | 'on' | 'psk') => {
    setObfuscatorUIMode(uiMode); // Update local UI state

    let newSettings: Record<string, string> = {};
    if (uiMode === 'on') {
      newSettings = { mode: 'enabled' }; // Example structure for "on"
      handleValueChange('headerObfuscatorSettings', newSettings);
    } else if (uiMode === 'psk') {
      // Keep existing PSK if switching to PSK mode, otherwise prompt
      newSettings = { mode: 'psk', psk: values.headerObfuscatorSettings?.psk || "" };
      // We trigger the update here, but the actual PSK save happens in handleSavePSK
      handleValueChange('headerObfuscatorSettings', newSettings);
      if (!newSettings.psk) { // Only show dialog if no PSK is set yet
        setShowPSKDialog(true);
      }
    } else { // 'off'
      handleValueChange('headerObfuscatorSettings', {}); // Empty object for off
    }
  };

  // Handle saving the PSK from the dialog
  const handleSavePSK = () => {
    // Update the headerObfuscatorSettings record with the new PSK
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
            // Use enum value from props
            value={values.encryptionAlgorithm || EncryptionAlgorithm.AES_GCM_256}
            // Pass enum value back up
            onValueChange={(value: EncryptionAlgorithm) => handleValueChange('encryptionAlgorithm', value)}
            defaultValue={EncryptionAlgorithm.AES_GCM_256}
          >
            <SelectTrigger id="encryption-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select encryption algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              {/* Use enum values for SelectItem */}
              <SelectItem value={EncryptionAlgorithm.AES_GCM_256} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">AES 256 GCM</SelectItem>
              <SelectItem value={EncryptionAlgorithm.ChaCha20Poly_1305} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">ChaCha20Poly1305</SelectItem>
              {/* Assuming KyberHybrid and Ascon80pq are valid options - add them if needed */}
              {/* <SelectItem value={EncryptionAlgorithm.KyberHybrid} className="...">Hybrid Kyber/AES 256 GCM</SelectItem> */}
              {/* <SelectItem value={EncryptionAlgorithm.Ascon80pq} className="...">Ascon80pq</SelectItem> */}
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
            // Use enum value from props
            value={values.kemAlgorithm || KemAlgorithm.Kyber}
            // Pass enum value back up
            onValueChange={(value: KemAlgorithm) => handleValueChange('kemAlgorithm', value)}
            defaultValue={KemAlgorithm.Kyber}
          >
            <SelectTrigger id="kem-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select KEM algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              {/* Use enum values for SelectItem */}
              <SelectItem value={KemAlgorithm.Kyber} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Kyber</SelectItem>
              {/* Add other KEM algorithms if available */}
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
            // Use CORRECT enum value from props
            value={values.sigAlgorithm || SigAlgorithm.None}
            // Pass CORRECT enum value back up with CORRECT key
            onValueChange={(value: SigAlgorithm) => handleValueChange('sigAlgorithm', value)}
            defaultValue={SigAlgorithm.None}
          >
            <SelectTrigger id="signing-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select signing algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              {/* Use enum values for SelectItem */}
              <SelectItem value={SigAlgorithm.None} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">None</SelectItem>
              <SelectItem value={SigAlgorithm.Falcon1024} className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Falcon1024</SelectItem>
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
            value={obfuscatorUIMode} // Use local UI state for the Select value
            onValueChange={handleHeaderObfuscatorChange} // Custom handler updates parent state
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
      <Dialog open={showPSKDialog} onOpenChange={setShowPSKDialog}>
        <DialogContent className="bg-[#282A42] text-white border-[#3D3F5A]">
          <DialogHeader>
            <DialogTitle>Enter Pre-Shared Key (PSK)</DialogTitle>
            <DialogDescription className="text-gray-300">
              Please enter your PSK for header obfuscation.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Enter your PSK"
            value={psk} // Bind to internal state
            onChange={(e) => setPsk(e.target.value)} // Update internal state
            className="bg-[#3B3D57] border-[#4D4F6C] text-white"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPSKDialog(false)}
              className="text-white hover:bg-purple-500/20"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSavePSK} // Saves internal psk state up to parent
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};