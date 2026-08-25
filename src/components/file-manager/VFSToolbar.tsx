import { ChevronRight, FolderPlus, Upload, RefreshCw, Home, Search, ArrowUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SortField = 'name' | 'date' | 'size' | 'type';
export type SortDirection = 'asc' | 'desc';

interface VFSToolbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onNewFolder: () => void;
  onUploadFile: () => void;
  onSync: () => void;
  filterText?: string;
  onFilterChange?: (text: string) => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
  selectionCount?: number;
}

const sortLabels: Record<SortField, string> = {
  name: 'Name',
  date: 'Date Modified',
  size: 'Size',
  type: 'Type',
};

export function VFSToolbar({
  currentPath,
  onNavigate,
  onNewFolder,
  onUploadFile,
  onSync,
  filterText = '',
  onFilterChange,
  sortField = 'name',
  sortDirection = 'asc',
  onSortChange,
  selectionCount = 0,
}: VFSToolbarProps) {
  const segments = currentPath.split('/').filter(Boolean);

  const handleSortClick = (field: SortField) => {
    if (!onSortChange) return;
    if (field === sortField) {
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, 'asc');
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
      {/* Left side: Breadcrumb navigation */}
      <div className="flex items-center gap-1 text-sm text-foreground/80 overflow-x-auto min-w-0 flex-1">
        <button
          onClick={() => onNavigate('/')}
          className="hover:text-foreground flex items-center gap-1 shrink-0"
        >
          <Home className="h-4 w-4" />
          <span>Root</span>
        </button>
        {segments.map((seg, i) => {
          const path = '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={path} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => onNavigate(path)}
                className="hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {/* Center: Selection count */}
      {selectionCount > 0 && (
        <div className="mx-4 text-xs text-primary-accent shrink-0">
          {selectionCount} selected
        </div>
      )}

      {/* Right side: Search, Sort, Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search/Filter */}
        {onFilterChange && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter..."
              value={filterText}
              onChange={(e) => onFilterChange(e.target.value)}
              className="h-7 w-32 pl-7 pr-6 text-xs bg-surface border-border text-foreground placeholder:text-muted-foreground"
            />
            {filterText && (
              <button
                onClick={() => onFilterChange('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Sort dropdown */}
        {onSortChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-foreground/80 hover:text-foreground hover:bg-card h-7 px-2">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">{sortLabels[sortField]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border">
              {(Object.keys(sortLabels) as SortField[]).map((field) => (
                <DropdownMenuItem
                  key={field}
                  onClick={() => handleSortClick(field)}
                  className={`text-foreground/80 hover:text-foreground hover:bg-card ${
                    field === sortField ? 'text-primary-accent' : ''
                  }`}
                >
                  {sortLabels[field]}
                  {field === sortField && (
                    <span className="ml-2 text-xs">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="w-px h-4 bg-primary" />

        {/* Action buttons */}
        <Button variant="ghost" size="sm" onClick={onNewFolder} className="text-foreground/80 hover:text-foreground hover:bg-card h-7 w-7 p-0">
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onUploadFile} className="text-foreground/80 hover:text-foreground hover:bg-card h-7 w-7 p-0">
          <Upload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onSync} className="text-foreground/80 hover:text-foreground hover:bg-card h-7 w-7 p-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
