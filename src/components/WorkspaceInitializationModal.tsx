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
    workspaceId?: string;
    serverAddress?: string;
    username?: string;
    fullName?: string;
}

export const WorkspaceInitializationModal: React.FC<WorkspaceInitializationModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    workspaceName,
    workspaceId,
    serverAddress,
    username,
    fullName
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

            // Get the user's permissions to update their role (they should now be Admin)
            // Use the username prop passed to this modal (not userService which may have "Loading..." placeholder)
            try {
                if (username) {
                    await WorkspaceService.getUserPermissions(username, 'workspace-root');
                    console.info('User permissions loaded after workspace initialization for:', username);
                } else {
                    console.warn('No username available to load permissions');
                }
            } catch (permErr) {
                console.warn('Failed to load user permissions after initialization:', permErr);
                // Don't fail the initialization, just warn
            }

            // Only show success toast if we got here without error
            toast({
                title: "Workspace Initialized",
                description: "You are now the workspace administrator.",
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
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-300">
                                <p className="font-semibold">You will become the Workspace Administrator</p>
                                <p className="mt-1">By entering the workspace password, you will initialize this workspace and receive full administrator privileges including the ability to:</p>
                                <ul className="mt-2 list-disc list-inside text-xs space-y-1">
                                    <li>Create and manage offices and rooms</li>
                                    <li>Add and remove users</li>
                                    <li>Grant permissions to other users</li>
                                    <li>Configure workspace settings</li>
                                </ul>
                                {(workspaceName || workspaceId || serverAddress || username) && (
                                    <div className="mt-3 pt-2 border-t border-amber-500/30 space-y-1 text-xs">
                                        {(workspaceId || workspaceName) && (
                                            <p><span className="text-amber-400">Workspace:</span> {workspaceId || workspaceName}</p>
                                        )}
                                        {serverAddress && <p><span className="text-amber-400">Server:</span> {serverAddress}</p>}
                                        {(fullName || username) && (
                                            <p><span className="text-amber-400">User:</span> {fullName && username && fullName !== username ? `${fullName} (${username})` : (username || fullName)}</p>
                                        )}
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
                                "Initialize & Become Admin"
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}; 