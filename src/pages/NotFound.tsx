import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { debugLog } from '@/lib/debug-config';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    debugLog('NotFound', '404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary-accent mb-4">404</h1>
        <p className="text-xl text-foreground/80 mb-6">Oops! Page not found</p>
        <Button
          onClick={() => navigate('/')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Return to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;

