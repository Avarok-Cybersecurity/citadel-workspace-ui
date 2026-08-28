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
        data-testid="manage-accounts-button"
        className="gap-2 border-primary-accent text-primary-accent hover:bg-primary-accent/20"
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