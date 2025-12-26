import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface WorkspaceNotInitializedModalProps {
    isOpen: boolean;
    onReturnToLogin: () => void;
}

export const WorkspaceNotInitializedModal: React.FC<WorkspaceNotInitializedModalProps> = ({
    isOpen,
    onReturnToLogin
}) => {
    const navigate = useNavigate();

    const handleReturnToLogin = () => {
        onReturnToLogin();
        navigate('/');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-6 w-6 text-yellow-500" />
                        <div>
                            <CardTitle className="text-white text-xl">Workspace Not Initialized</CardTitle>
                            <CardDescription className="text-gray-300">
                                Setup required before you can register
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                        <p className="text-yellow-300 text-sm">
                            This workspace has not been initialized yet. Please contact your workspace administrator to complete the initial setup.
                        </p>
                    </div>

                    <div className="space-y-2 text-gray-300 text-sm">
                        <p>The administrator needs to:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Log in with their admin credentials</li>
                            <li>Set up the workspace name and description</li>
                            <li>Configure the workspace master password</li>
                        </ul>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                        <p className="text-purple-300 text-xs">
                            Once the workspace is initialized, you'll be able to register and join the workspace.
                        </p>
                    </div>
                </CardContent>

                <CardFooter>
                    <Button
                        onClick={handleReturnToLogin}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Return to Login
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};