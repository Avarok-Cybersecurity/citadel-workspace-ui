import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkspaceService from "@/lib/workspace-service";
import { WorkspaceProtocolRequestTS, WorkspaceProtocolPayloadTS } from "@/types/workspace-protocol";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { workspaceEvents } from "@/lib/workspace-events";

interface WorkspaceInitializationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    workspaceName?: string;
    serverAddress?: string;
    username?: string;
}

export const WorkspaceInitializationModal: React.FC<WorkspaceInitializationModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    workspaceName,
    serverAddress,
    username
}) => {
    const [masterPassword, setMasterPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMasterPassword(e.target.value);
        setError(null); // Clear error on input change
    };

    const validateForm = (): boolean => {
        if (!masterPassword) {
            setError("Workspace password is required");
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Create metadata to mark workspace as initialized
            const metadata = {
                initialized: true
            };
            const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
            const metadataArray = Array.from(metadataBytes);

            // Always use UpdateWorkspace since the server creates the root workspace on startup
            const request: WorkspaceProtocolRequestTS = {
                UpdateWorkspace: {
                    workspace_master_password: masterPassword,
                    name: null,
                    description: null,
                    metadata: metadataArray
                }
            };

            // Send the request through the workspace service
            const payload: WorkspaceProtocolPayloadTS = { Request: request };
            
            // Create a promise that resolves when we get a response
            const responsePromise = new Promise<void>((resolve, reject) => {
                let unsubscribeWorkspace: (() => void) | null = null;
                let unsubscribeError: (() => void) | null = null;
                let timeoutId: NodeJS.Timeout | null = null;
                
                const cleanup = () => {
                    if (unsubscribeWorkspace) unsubscribeWorkspace();
                    if (unsubscribeError) unsubscribeError();
                    if (timeoutId) clearTimeout(timeoutId);
                };
                
                // Listen for workspace response
                workspaceEvents.onWorkspaceEvent('workspace:loaded', (payload) => {
                    cleanup();
                    resolve();
                }).then(unsub => {
                    unsubscribeWorkspace = unsub;
                });
                
                // Also listen for errors
                workspaceEvents.onOperationEvent('operation:error', (error) => {
                    cleanup();
                    reject(new Error(error.message || 'Failed to initialize workspace'));
                }).then(unsub => {
                    unsubscribeError = unsub;
                });
                
                // Timeout after 10 seconds
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Request timed out'));
                }, 10000);
            });
            
            // Send the request
            await WorkspaceService.sendWorkspaceRequest(payload);
            
            // Wait for the response
            await responsePromise;
            
            // Only show success toast if we got here without error
            toast({
                title: "Workspace Initialized",
                description: "The workspace has been successfully initialized.",
            });

            // Clear form
            setMasterPassword("");

            // Call success callback
            onSuccess();
        } catch (err: any) {
            console.error("Failed to initialize workspace:", err);
            const userFriendlyMessage = getUserFriendlyErrorMessage(err);
            setError(userFriendlyMessage);
            
            toast({
                title: getErrorTitle(err),
                description: userFriendlyMessage,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Shield className="h-6 w-6 text-purple-500" />
                        <div>
                            <CardTitle className="text-white text-xl">Initialize Workspace</CardTitle>
                            <CardDescription className="text-gray-300">
                                Enter the workspace password to initialize
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-purple-300">
                                <p>This workspace has not been initialized. Please enter the workspace password to complete the setup.</p>
                                {(workspaceName || serverAddress || username) && (
                                    <div className="mt-2 space-y-1 text-xs">
                                        {workspaceName && <p><span className="text-purple-400">Workspace:</span> {workspaceName}</p>}
                                        {serverAddress && <p><span className="text-purple-400">Server:</span> {serverAddress}</p>}
                                        {username && <p><span className="text-purple-400">User:</span> {username}</p>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="masterPassword" className="text-gray-300">
                                Workspace Password
                            </Label>
                            <Input
                                id="masterPassword"
                                name="masterPassword"
                                type="password"
                                value={masterPassword}
                                onChange={handleInputChange}
                                className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                                placeholder="Enter the workspace password"
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-gray-400">
                                Contact your workspace administrator if you don't have the password.
                            </p>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded border border-red-400/20 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                    </CardContent>

                    <CardFooter className="flex justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            className="text-white hover:bg-purple-500/20"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Initializing...
                                </>
                            ) : (
                                "Initialize Workspace"
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}; 