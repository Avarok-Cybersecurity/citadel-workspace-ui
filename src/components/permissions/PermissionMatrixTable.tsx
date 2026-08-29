/**
 * The role × permission matrix.
 *
 * Split out of PermissionManager when naming its checkboxes pushed that file
 * past the 250-line cap. The accessibility work is the substance here: Radix
 * renders a checkbox as a <button> with no text, so a matrix of them announced
 * dozens of identical "checkbox, not checked" with nothing to tell them apart —
 * on the app's access-control surface, which made it unusable non-visually.
 *
 * Each checkbox is named outright rather than left to table semantics, because
 * row and column headers only help a reader that is in table mode, and that is
 * not a bet worth taking here. The headers are correct too (`scope`, and the
 * permission cell as a `th`), so both routes work.
 */

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ROLE_HIERARCHY } from './permission-constants';

interface PermissionMatrixTableProps {
  allPermissions: [string, { id: string; label: string }[]][];
  rolePermissions: Record<string, Set<string>>;
  togglePermission: (role: string, permissionId: string) => void;
}

export function PermissionMatrixTable({
  allPermissions,
  rolePermissions,
  togglePermission,
}: PermissionMatrixTableProps) {
  return (
    <>
  {/* Matrix Table */}
  <div className="flex-1 overflow-auto min-h-0">
    <table className="w-full border-collapse">
      {/* Role column headers */}
      <thead className="sticky top-0 z-10 bg-background">
        <tr>
          <th scope="col" className="sticky left-0 z-20 bg-background text-left text-xs font-semibold tracking-wider uppercase text-muted-foreground px-3 sm:px-6 py-3 w-[132px] sm:w-[200px] border-b border-border">
            Permission
          </th>
          {ROLE_HIERARCHY.map(role => (
            <th
              key={role.value}
              scope="col"
              className="text-center px-3 py-3 border-b border-border min-w-[90px]"
            >
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-foreground/80">
                <div className={`w-1.5 h-1.5 rounded-full ${role.color}`} />
                {role.label}
              </span>
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {allPermissions.map(([category, permissions]) => (
          <React.Fragment key={category}>
            {/* Category header row */}
            <tr>
              <td
                colSpan={ROLE_HIERARCHY.length + 1}
                className="sticky left-0 bg-background px-3 sm:px-6 pt-4 pb-1.5"
              >
                <span className="text-xs font-semibold tracking-wider uppercase text-primary-accent">
                  {category}
                </span>
              </td>
            </tr>

            {/* Permission rows */}
            {permissions.map((permission, idx) => (
              <tr
                key={permission.id}
                className={`group hover:bg-primary-accent/5 transition-colors ${
                  idx === permissions.length - 1 ? '' : ''
                }`}
              >
                {/* th, not td: the row header is what a screen reader reads
                    back to say WHICH permission a checkbox belongs to. As a
                    td the matrix announced dozens of identical "checkbox,
                    not checked" with nothing to tell them apart. */}
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background px-3 sm:px-6 py-2 text-left font-normal"
                  // Addressed by id, not by its words. A spec that hunted for
                  // the string "Edit MDX Content" stopped finding anything the
                  // day the label became "Can edit MDX documents", and what it
                  // was actually guarding -- that this column stays on screen
                  // at 375px -- went unchecked for every run since, while the
                  // failure read as a broken test rather than a lost guard.
                  data-testid={`permission-row-${permission.id}`}
                >
                  <span className="text-sm text-foreground/80">{permission.label}</span>
                </th>
                {ROLE_HIERARCHY.map(role => {
                  const isChecked: boolean = rolePermissions[role.value]?.has(permission.id) ?? false;
                  return (
                    <td key={role.value} className="text-center px-3 py-2">
                      <div className="flex items-center justify-center">
                        {/* Named outright rather than left to table
                            semantics. Radix renders a <button
                            role="checkbox"> with no text, and row/column
                            headers alone depend on the reader being in
                            table mode -- on the app's access-control
                            surface that is not a bet worth taking. */}
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => togglePermission(role.value, permission.id)}
                          aria-label={`${permission.label} for ${role.label}`}
                          className="h-4 w-4 border-surface data-[state=checked]:bg-primary data-[state=checked]:border-primary-accent"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
    </>
  );
}
