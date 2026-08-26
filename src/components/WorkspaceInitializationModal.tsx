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
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import type { WorkspaceInitializationModalProps } from './workspace-init-types';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';

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
        setError(null);
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
            const metadata = { initialized: true };
            const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
            const metadataArray = Array.from(metadataBytes);

            const request: WorkspaceProtocolRequestTS = {
                UpdateWorkspace: {
                    workspace_master_password: masterPassword,
                    name: undefined,
                    description: undefined,
                    metadata: metadataArray
                }
            };

            const payload: WorkspaceProtocolPayloadTS = { Request: request };

            const responsePromise = new Promise<void>((resolve, reject) => {
                let unsubscribeWorkspace: (() => void) | null = null;
                let unsubscribeError: (() => void) | null = null;
                let timeoutId: NodeJS.Timeout | null = null;

                const cleanup = () => {
                    if (unsubscribeWorkspace) unsubscribeWorkspace();
                    if (unsubscribeError) unsubscribeError();
                    if (timeoutId) clearTimeout(timeoutId);
                };

                runAsyncSetup(async () => {
                    unsubscribeWorkspace = await workspaceEvents.onWorkspaceEvent('workspace:loaded', () => {
                        cleanup();
                        resolve();
                    });
                });

                runAsyncSetup(async () => {
                    unsubscribeError = await workspaceEvents.onOperationEvent('operation:error', (error) => {
                        cleanup();
                        reject(new Error(error.message || 'Failed to initialize workspace'));
                    });
                });

                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error('Request timed out'));
                }, 10000);
            });

            await WorkspaceService.sendWorkspaceRequest(payload);
            await responsePromise;

            try {
                if (username) {
                    await WorkspaceService.getUserPermissions(username, WORKSPACE_ROOT_ID);
                    debugLog('WorkspaceInitializationModal', 'User permissions loaded after workspace initialization for:', username);
                } else {
                    debugLog('WorkspaceInitializationModal', 'No username available to load permissions');
                }
            } catch (permErr) {
                debugLog('WorkspaceInitializationModal', 'Failed to load user permissions after initialization:', permErr);
            }

            toast({
                title: "Workspace Initialized",
                description: "You are now the workspace administrator.",
            });

            setMasterPassword("");
            onSuccess();
        } catch (err: unknown) {
            debugLog('WorkspaceInitializationModal', 'Failed to initialize workspace:', err);
            const errArg = err instanceof Error ? err : String(err);
            const userFriendlyMessage = getUserFriendlyErrorMessage(errArg);
            setError(userFriendlyMessage);

            toast({
                title: getErrorTitle(errArg),
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
            <Card className="bg-card border-surface shadow-lg w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Shield className="h-6 w-6 text-primary-accent" />
                        <div>
                            <CardTitle className="text-foreground text-xl">Initialize Workspace</CardTitle>
                            <CardDescription className="text-foreground/80">
                                Enter the workspace password to initialize
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4 max-h-[calc(100dvh-16rem)] overflow-y-auto">
                        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-warning">
                                <p className="font-semibold">You will become the Workspace Administrator</p>
                                <p className="mt-1">By entering the workspace password, you will initialize this workspace and receive full administrator privileges including the ability to:</p>
                                <ul className="mt-2 list-disc list-inside text-xs space-y-1">
                                    <li>Create and manage offices and rooms</li>
                                    <li>Add and remove users</li>
                                    <li>Grant permissions to other users</li>
                                    <li>Configure workspace settings</li>
                                </ul>
                                {(workspaceName || workspaceId || serverAddress || username) && (
                                    <div className="mt-3 pt-2 border-t border-warning/30 space-y-1 text-xs">
                                        {(workspaceId || workspaceName) && (
                                            <p><span className="text-warning">Workspace:</span> {workspaceId || workspaceName}</p>
                                        )}
                                        {serverAddress && <p><span className="text-warning">Server:</span> {serverAddress}</p>}
                                        {(fullName || username) && (
                                            <p><span className="text-warning">User:</span> {fullName && username && fullName !== username ? `${fullName} (${username})` : (username || fullName)}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="masterPassword" className="text-foreground/80">
                                Workspace Password
                            </Label>
                            <Input
                                id="masterPassword"
                                autoComplete="off"
                                name="masterPassword"
                                type="password"
                                value={masterPassword}
                                onChange={handleInputChange}
                                className="bg-surface border-border text-foreground"
                                placeholder="Enter the workspace password"
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Contact your workspace administrator if you don't have the password.
                            </p>
                        </div>

                        {error && (
                            <div className="text-destructive-emphasis text-sm p-2 bg-destructive/10 rounded border border-destructive/20 flex items-center gap-2">
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
                            className="text-foreground hover:bg-primary-accent/20"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
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
