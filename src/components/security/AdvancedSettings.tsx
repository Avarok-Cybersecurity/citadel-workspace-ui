import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SecuritySettingsValues } from "../SecuritySettings";
import { Label } from "@/components/ui/label";

interface AdvancedSettingsProps {
  values?: SecuritySettingsValues;
  onChange?: (key: keyof SecuritySettingsValues, value: any) => void;
}

export const AdvancedSettings = ({ values = {}, onChange }: AdvancedSettingsProps) => {
  const [showPSKDialog, setShowPSKDialog] = useState(false);
  const [psk, setPsk] = useState(values.psk || "");
  
  // Update psk state if values prop changes
  useEffect(() => {
    if (values.psk !== undefined) {
      setPsk(values.psk);
    }
  }, [values.psk]);

  const handleValueChange = (key: keyof SecuritySettingsValues, value: any) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  const handleHeaderObfuscatorChange = (value: string) => {
    handleValueChange('headerObfuscatorMode', value);
    
    if (value === "psk") {
      setShowPSKDialog(true);
    }
  };
  
  const handleSavePSK = () => {
    handleValueChange('psk', psk);
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
            value={values.encryptionAlgorithm || "aes"} 
            onValueChange={(value) => handleValueChange('encryptionAlgorithm', value)}
            defaultValue="aes"
          >
            <SelectTrigger id="encryption-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select encryption algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value="aes" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">AES 256 GCM</SelectItem>
              <SelectItem value="chacha" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">ChaCha20Poly1305</SelectItem>
              <SelectItem value="hybrid" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Hybrid Kyber/AES 256 GCM</SelectItem>
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
            value={values.kemAlgorithm || "kyber"} 
            onValueChange={(value) => handleValueChange('kemAlgorithm', value)}
            defaultValue="kyber"
          >
            <SelectTrigger id="kem-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select KEM algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value="kyber" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Kyber</SelectItem>
              <SelectItem value="classic" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Classic</SelectItem>
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
            value={values.signingAlgorithm || "falcon"} 
            onValueChange={(value) => handleValueChange('signingAlgorithm', value)}
            defaultValue="falcon"
          >
            <SelectTrigger id="signing-algorithm" className="w-full bg-[#3B3D57] border-[#4D4F6C] text-white">
              <SelectValue placeholder="Select signing algorithm" />
            </SelectTrigger>
            <SelectContent className="bg-[#2A2438] border border-purple-400/30 text-white shadow-xl p-2">
              <SelectItem value="falcon" className="hover:bg-purple-500/20 focus:bg-purple-500/20 rounded-sm p-2">Falcon1024</SelectItem>
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
            value={values.headerObfuscatorMode || "off"} 
            onValueChange={handleHeaderObfuscatorChange}
            defaultValue="off"
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
            value={psk}
            onChange={(e) => setPsk(e.target.value)}
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
              onClick={handleSavePSK}
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