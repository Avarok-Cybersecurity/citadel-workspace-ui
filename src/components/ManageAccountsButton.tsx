import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { AccountManagementDialog } from './AccountManagementDialog';

export function ManageAccountsButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-purple-500 text-purple-400 hover:bg-purple-500/20"
        onClick={() => setDialogOpen(true)}
      >
        <Users className="h-4 w-4" />
        Manage Accounts
      </Button>
      
      <AccountManagementDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}