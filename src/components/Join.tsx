import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceNotInitializedModal } from "./WorkspaceNotInitializedModal";
import { ConnectLoadingModal } from "./LoadingModal";
import { useJoinRegistration } from "./useJoinRegistration";
import { JoinFormFields } from "./JoinFormFields";

interface JoinProps {
  onNext: (cid: string) => void;
  onBack: () => void;
  defaultWorkspace?: string;
}

export const Join = ({ onNext, onBack, defaultWorkspace }: JoinProps) => {
  const {
    formData,
    isRegistering,
    showNotInitializedModal,
    showConnectModal,
    connectStatus,
    handleInputChange,
    handleSubmit,
    handleConnectModalComplete,
    handleReturnToLogin,
  } = useJoinRegistration(onBack);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md">
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg">
          <CardHeader>
            <CardTitle className="text-white text-xl">Create Your Profile</CardTitle>
            <CardDescription className="text-gray-300">
              {defaultWorkspace ? `Join ${defaultWorkspace} with a new account` : "Create your profile for this workspace"}
            </CardDescription>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-1">
                <div className="w-8 h-1 rounded-full bg-purple-500" />
                <div className="w-8 h-1 rounded-full bg-purple-500" />
                <div className="w-8 h-1 rounded-full bg-purple-500" />
              </div>
              <span className="text-xs text-gray-400">Step 3 of 3</span>
            </div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
              <JoinFormFields formData={formData} onChange={handleInputChange} />
            </CardContent>

            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="text-white hover:bg-purple-500/20"
                disabled={isRegistering}
              >
                BACK
              </Button>
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    REGISTERING...
                  </>
                ) : "JOIN"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <WorkspaceNotInitializedModal
        isOpen={showNotInitializedModal}
        onReturnToLogin={handleReturnToLogin}
      />

      <ConnectLoadingModal
        open={showConnectModal}
        status={connectStatus}
        username={formData.username}
        onComplete={handleConnectModalComplete}
      />
    </div>
  );
};
